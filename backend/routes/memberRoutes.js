const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const Member = require("../models/Member");
const Counter = require("../models/Counter");
const Payment = require("../models/Payment");
const SnackOrder = require("../models/SnackOrder");
const LeaveRequest = require("../models/LeaveRequest");
const LeaveStat = require("../models/LeaveStat");
const Otp = require("../models/Otp");
const User = require("../models/User");
const { calculateMemberBilling } = require("../utils/billing");
const { resolveMemberPrimaryFields } = require("../utils/translateEnToMr");
const { statusMrFor, mealPlanMrFor } = require("../utils/memberLabelsMr");

const router = express.Router();
const {
  authenticate,
  requireAdmin,
  requireMember,
  ensureSelfParam,
} = require("../middleware/authMiddleware");

function normalizeMonthStartLocal(monthDate) {
  const d = monthDate instanceof Date ? monthDate : new Date(monthDate);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

async function getNextMemberRollNumber() {
  const countersKey = "memberRollNumber";

  // Prefer the dedicated `member_roll_counters` collection if present.
  try {
    const db = mongoose.connection?.db;
    if (db) {
      const coll = db.collection("member_roll_counters");

      // Case 1: { name, seq }
      const updated = await coll.findOneAndUpdate(
        { name: countersKey },
        {
          $inc: { seq: 1 },
          // First generated roll number should be `0`.
          $setOnInsert: { name: countersKey, seq: -1 },
        },
        { upsert: true, returnDocument: "after", projection: { seq: 1 } }
      );
      const nextSeq = updated?.value?.seq;
      if (typeof nextSeq === "number") return String(nextSeq);

      // Case 2: { _id, seq }
      const updated2 = await coll.findOneAndUpdate(
        { _id: countersKey },
        {
          $inc: { seq: 1 },
          // First generated roll number should be `0`.
          $setOnInsert: { seq: -1 },
        },
        { upsert: true, returnDocument: "after", projection: { seq: 1 } }
      );
      const nextSeq2 = updated2?.value?.seq;
      if (typeof nextSeq2 === "number") return String(nextSeq2);
    }
  } catch (e) {
    // If `member_roll_counters` is missing or has unexpected shape,
    // fall back to the existing `counters` collection.
    console.warn("member_roll_counters not usable; falling back:", e?.message || e);
  }

  const rollCounter = await Counter.findOneAndUpdate(
    { name: countersKey },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  return String(rollCounter.seq);
}

// GET /api/members - Fetch all members
router.get("/", authenticate, requireAdmin, async (req, res) => {
  try {
    // Admin UI edits need email from `users` collection.
    const members = await Member.find()
      .populate("userId", "email")
      .sort({ createdAt: -1 })
      .lean();

    // Flatten email onto member object (frontend expects `member.email`).
    const flattened = members.map((m) => {
      if (m?.userId?.email) return { ...m, email: m.userId.email };
      return m;
    });

    // Add dueAmount (sum of monthly remaining amounts from joining-month → current-month).
    const memberIds = flattened.map((m) => m?._id).filter(Boolean);

    const monthKeyLocal = (d) => {
      const dt = d instanceof Date ? d : new Date(d);
      if (Number.isNaN(dt.getTime())) return null;
      return `${dt.getFullYear()}-${dt.getMonth()}`;
    };

    const getMonthStartLocal = (d) => {
      const dt = d instanceof Date ? d : new Date(d);
      if (Number.isNaN(dt.getTime())) return null;
      return new Date(dt.getFullYear(), dt.getMonth(), 1, 0, 0, 0, 0);
    };

    if (memberIds.length) {
      const now = new Date();
      const currentMonthStart = getMonthStartLocal(now);

      const buildMonthStarts = (joiningDate) => {
        const start = getMonthStartLocal(joiningDate);
        if (!start || !currentMonthStart) return [];
        if (start.getTime() > currentMonthStart.getTime()) return [];

        const months = [];
        let cursor = new Date(start);
        while (cursor.getTime() <= currentMonthStart.getTime()) {
          months.push(new Date(cursor));
          cursor.setMonth(cursor.getMonth() + 1);
        }
        return months;
      };

      for (const m of flattened) {
        const memberId = m?._id;
        if (!memberId) continue;

        const monthStarts = buildMonthStarts(m.joiningDate);

        let dueTotal = 0; // remaining sum
        let totalBillsSum = 0; // sum of monthly totalBill
        for (const monthDate of monthStarts) {
          const key = monthKeyLocal(monthDate);
          if (!key) continue;

          // Recompute from source data.
          const doc = await calculateMemberBilling(memberId, monthDate);
          totalBillsSum += Number(doc?.totalBill || 0);
          const remaining = Number(doc?.remainingAmount || 0);
          dueTotal += remaining;
        }

        const dueAmount = Number(dueTotal || 0);
        const duePayment = Number(totalBillsSum || 0);
        m.dueAmount = dueAmount;
        // Requested behavior: Due Payment = combined monthly total bills.
        m.duePayment = duePayment;
      }
    }

    res.json(flattened);
  } catch (error) {
    console.error("Get members error:", error);
    res.status(500).json({ message: "Failed to fetch members" });
  }
});

// GET /api/members/split-members
// Member-safe list used by Snack split flow.
// Returns only minimal identifying fields; accessible to authenticated members.
router.get(
  "/split-members",
  authenticate,
  async (req, res) => {
    try {
      // This endpoint is used by the member "split bill" picker.
      // Accept both member/admin tokens as long as the request is authenticated.
      const tokenRoleRaw = req.auth?.role;
      const tokenRole =
        typeof tokenRoleRaw === "string" ? tokenRoleRaw.trim().toLowerCase() : tokenRoleRaw;
      if (!tokenRole || !["member", "admin"].includes(tokenRole)) {
        console.warn("split-members forbidden", {
          tokenRoleRaw,
          tokenRole,
          tokenId: req.auth?.id,
        });
        return res.status(403).json({ message: "Forbidden" });
      }

      const members = await Member.find({ status: "Active" })
        .select("_id name rollNumber")
        .sort({ createdAt: -1 })
        .lean();

      res.json(members || []);
    } catch (error) {
      console.error("Get split members error:", error);
      res.status(500).json({ message: "Failed to fetch members" });
    }
  }
);

// GET /api/members/due-month?month=YYYY-MM-DD
// Admin-only: returns totals for a month plus per-member pending/paid for that month.
router.get(
  "/due-month",
  authenticate,
  requireAdmin,
  async (req, res) => {
    try {
      const { month } = req.query || {};

      const monthParam = String(month || "").trim();
      const m = monthParam.match(/^(\d{4})-(\d{2})/);
      if (!m) {
        return res.status(400).json({ message: "Invalid month" });
      }

      const year = Number(m[1]);
      const monthIndex = Number(m[2]) - 1;
      const monthStart = new Date(year, monthIndex, 1, 0, 0, 0, 0);
      if (Number.isNaN(monthStart.getTime())) {
        return res.status(400).json({ message: "Invalid month" });
      }

      const monthEndExclusive = new Date(
        year,
        monthIndex + 1,
        1,
        0,
        0,
        0,
        0
      );

      // Compute due for all members who joined on/before the end of the month.
      const membersToCompute = await Member.find({
        joiningDate: { $lt: monthEndExclusive },
      })
        .select("_id")
        .lean();

      const members = await Promise.all(
        (membersToCompute || []).map(async (m) => {
          const memberDoc = await Member.findById(m._id)
            .select(
              "name nameMr rollNumber roomOwnerName roomOwnerNameMr status statusMr mealPlan mealPlanMr joiningDate"
            )
            .lean();
          const billing = await calculateMemberBilling(m._id, monthStart);

          return {
            memberId: memberDoc?._id || m._id,
            name: memberDoc?.name || "",
            nameMr: memberDoc?.nameMr || "",
            rollNumber: memberDoc?.rollNumber || "",
            roomOwnerName: memberDoc?.roomOwnerName || "",
            roomOwnerNameMr: memberDoc?.roomOwnerNameMr || "",
            status: memberDoc?.status || "",
            statusMr: memberDoc?.statusMr || "",
            mealPlan: memberDoc?.mealPlan || "",
            mealPlanMr: memberDoc?.mealPlanMr || "",
            joiningDate: memberDoc?.joiningDate || null,
            dueAmount: Number(billing?.remainingAmount || 0),
            paidAmount: Number(billing?.paidAmount || 0),
            remainingAmount: Number(billing?.remainingAmount || 0),
            monthlyStatus: billing?.status || "Pending",
          };
        })
      );

      const totals = (members || []).reduce(
        (acc, m) => {
          acc.collected += Number(m.paidAmount || 0);
          acc.pending += Number(m.remainingAmount || 0);
          if (Number(m.remainingAmount || 0) <= 0) acc.membersPaid += 1;
          if (Number(m.remainingAmount || 0) > 0) acc.remainingMembers += 1;
          return acc;
        },
        { collected: 0, pending: 0, membersPaid: 0, remainingMembers: 0 }
      );

      res.json({ month: monthStart, totals, members });
    } catch (error) {
      console.error("Get due-month error:", error);
      res.status(500).json({ message: "Failed to fetch due month" });
    }
  }
);

// GET /api/members/:id - Fetch a single member (for member app/dashboard)
router.get(
  "/:id",
  authenticate,
  requireMember,
  ensureSelfParam("id"),
  async (req, res) => {
  try {
    const { id } = req.params;
    // Include auth email stored in `users` collection.
    const member = await Member.findById(id)
      .populate("userId", "email")
      .lean();
    if (!member) {
      return res.status(404).json({ message: "Member not found" });
    }

    // Flatten email onto the member object (frontend expects `member.email`).
    if (member?.userId?.email && !member.email) {
      member.email = member.userId.email;
    }

      // Attach dueAmount to this member: joining-month → current-month.
      const monthKeyLocal = (d) => {
        const dt = d instanceof Date ? d : new Date(d);
        if (Number.isNaN(dt.getTime())) return null;
        return `${dt.getFullYear()}-${dt.getMonth()}`;
      };

      const getMonthStartLocal = (d) => {
        const dt = d instanceof Date ? d : new Date(d);
        if (Number.isNaN(dt.getTime())) return null;
        return new Date(dt.getFullYear(), dt.getMonth(), 1, 0, 0, 0, 0);
      };

      const now = new Date();
      const currentMonthStart = getMonthStartLocal(now);

      const monthStarts = (() => {
        const start = getMonthStartLocal(member.joiningDate);
        if (!start || !currentMonthStart) return [];
        if (start.getTime() > currentMonthStart.getTime()) return [];
        const months = [];
        let cursor = new Date(start);
        while (cursor.getTime() <= currentMonthStart.getTime()) {
          months.push(new Date(cursor));
          cursor.setMonth(cursor.getMonth() + 1);
        }
        return months;
      })();

      let dueTotal = 0; // remaining sum
      let totalBillsSum = 0; // sum of monthly totalBill
      const monthlyDueBills = [];
      for (const monthDate of monthStarts) {
        const key = monthKeyLocal(monthDate);
        if (!key) continue;
        // Recompute from source data.
        const doc = await calculateMemberBilling(id, monthDate);
        const billDoc = doc
          ? {
              month: doc.month,
              totalBill: Number(doc.totalBill || 0),
              paidAmount: Number(doc.paidAmount || 0),
              remainingAmount: Number(doc.remainingAmount || 0),
            }
          : null;
        totalBillsSum += Number(billDoc?.totalBill || 0);

        const remaining = Number(billDoc?.remainingAmount || 0);
        dueTotal += remaining;
        if (remaining > 0) {
          monthlyDueBills.push({
            month: billDoc?.month || monthDate,
            totalBill: Number(billDoc?.totalBill || 0),
            paidAmount: Number(billDoc?.paidAmount || 0),
            remainingAmount: remaining,
          });
        }
      }

      const dueAmount = Number(dueTotal || 0);
      const duePayment = Number(totalBillsSum || 0);
      member.dueAmount = dueAmount;
      // Requested behavior: Due Payment = combined monthly total bills.
      member.duePayment = duePayment;
      member.monthlyDueBills = monthlyDueBills;

    return res.json(member);
  } catch (error) {
    console.error("Get member by id error:", error);
    return res.status(500).json({ message: "Failed to fetch member" });
  }
  }
);

// GET /api/members/:id/due?month=YYYY-MM-DD
// Admin-only: returns due up to (and including) the selected month.
// Used by Admin/Payments to show accurate "Current Due" + "Due After This Payment".
router.get(
  "/:id/due",
  authenticate,
  requireAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { month } = req.query || {};

      const member = await Member.findById(id).lean();
      if (!member) return res.status(404).json({ message: "Member not found" });

      const joiningMonthStart = normalizeMonthStartLocal(member.joiningDate);
      const parseMonthParamToLocalMonthStart = (monthParam) => {
        if (!monthParam) return normalizeMonthStartLocal(new Date());
        if (monthParam instanceof Date) return normalizeMonthStartLocal(monthParam);
        const s = String(monthParam).trim();
        // Accept `YYYY-MM` or `YYYY-MM-DD` explicitly to avoid UTC parsing shifts.
        const m = s.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
        if (m) {
          const year = Number(m[1]);
          const monthIndex = Number(m[2]) - 1;
          return new Date(year, monthIndex, 1, 0, 0, 0, 0);
        }
        // Fallback: parse as Date and normalize.
        return normalizeMonthStartLocal(new Date(s));
      };

      const targetMonthStart = parseMonthParamToLocalMonthStart(month);

      if (!joiningMonthStart || !targetMonthStart) {
        return res.json({ dueBeforePayment: 0, remainingForMonth: 0 });
      }

      // If the selected month is before the member joined, due is 0.
      if (joiningMonthStart.getTime() > targetMonthStart.getTime()) {
        return res.json({ dueBeforePayment: 0, remainingForMonth: 0 });
      }

      const monthsToInclude = [];
      let cursor = new Date(joiningMonthStart);
      while (cursor.getTime() <= targetMonthStart.getTime()) {
        monthsToInclude.push(new Date(cursor));
        cursor.setMonth(cursor.getMonth() + 1);
      }

      const monthKeyLocal = (d) => {
        if (!(d instanceof Date)) return null;
        if (Number.isNaN(d.getTime())) return null;
        return `${d.getFullYear()}-${d.getMonth()}`;
      };

      let dueBeforePayment = 0;
      let remainingForMonth = 0;

      for (const monthStart of monthsToInclude) {
        const key = monthKeyLocal(monthStart);
        if (!key) continue;

        const doc = await calculateMemberBilling(id, monthStart);
        const remaining = Number(doc?.remainingAmount || 0);

        dueBeforePayment += remaining;
        if (monthKeyLocal(targetMonthStart) === key) remainingForMonth = remaining;
      }

      return res.json({
        dueBeforePayment: Number(dueBeforePayment || 0),
        remainingForMonth: Number(remainingForMonth || 0),
      });
    } catch (error) {
      console.error("Get member due error:", error);
      return res.status(500).json({ message: "Failed to fetch due" });
    }
  }
);

// GET /api/member/:id/billing?month=YYYY-MM-DD&monthOffset=-1
router.get(
  "/:id/billing",
  authenticate,
  requireMember,
  ensureSelfParam("id"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { month, monthOffset } = req.query || {};

      let monthDate = month ? new Date(month) : new Date();
      const offsetNum =
        monthOffset !== undefined && monthOffset !== null
          ? Number(monthOffset)
          : null;
      if (offsetNum != null && !Number.isNaN(offsetNum)) {
        monthDate = new Date(monthDate);
        monthDate.setMonth(monthDate.getMonth() + offsetNum);
      }

      const billing = await calculateMemberBilling(id, monthDate);
      if (!billing) return res.status(404).json({ message: "Billing not found" });
      return res.json(billing);
    } catch (error) {
      console.error("Get member billing error:", error);
      res.status(500).json({ message: "Failed to fetch billing" });
    }
  }
);

// POST /api/members - Create a new member (admin UI)
router.post("/", async (req, res) => {
  try {
    const {
      name,
      nameMr,
      roomOwnerName,
      roomOwnerNameMr,
      phone,
      email,
      password,
      joiningDate,
      status,
      mealPlan,
    } =
      req.body;

    if (!name || !roomOwnerName || !phone || !email || !password) {
      return res.status(400).json({
        message:
          "Name, room owner name, phone, email and password are required",
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    // Ensure unique member auth record.
    const existingUser = await User.findOne({ email: normalizedEmail, role: "member" }).lean();
    if (existingUser) {
      return res.status(400).json({ message: "Member email already exists" });
    }

    const nextRollNumber = await getNextMemberRollNumber();

    const normalizedMealPlan =
      mealPlan === "Dinner" ? "Dinner" : mealPlan === "Both" ? "Both" : "Lunch";
    const normalizedStatus = status === "Inactive" ? "Inactive" : "Active";

    const rawPassword = password ? String(password).trim() : "";
    if (!rawPassword) {
      return res.status(400).json({ message: "Password is required" });
    }
    const hashedPassword = await bcrypt.hash(rawPassword, 10);

    const user = await User.create({
      email: normalizedEmail,
      password: hashedPassword,
      role: "member",
      activeSessionToken: null,
    });

    const [namePair, roomPair] = await Promise.all([
      resolveMemberPrimaryFields(
        String(name).trim(),
        String(nameMr ?? "").trim(),
        "",
        ""
      ),
      resolveMemberPrimaryFields(
        String(roomOwnerName).trim(),
        String(roomOwnerNameMr ?? "").trim(),
        "",
        ""
      ),
    ]);

    const member = new Member({
      userId: user._id,
      name: namePair.en,
      nameMr: namePair.mr || "",
      rollNumber: nextRollNumber,
      roomOwnerName: roomPair.en,
      roomOwnerNameMr: roomPair.mr || "",
      phone: String(phone).trim(),
      joiningDate: joiningDate ? new Date(joiningDate) : new Date(),
      status: normalizedStatus,
      statusMr: statusMrFor(normalizedStatus),
      mealPlan: normalizedMealPlan,
      mealPlanMr: mealPlanMrFor(normalizedMealPlan),
    });

    await member.save();

    res.status(201).json(member);
  } catch (error) {
    console.error("Create member error:", error);
    res.status(500).json({ message: "Failed to create member" });
  }
});

// PUT /api/members/:id - Update a member
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      nameMr,
      roomOwnerName,
      roomOwnerNameMr,
      phone,
      email,
      password,
      joiningDate,
      status,
      mealPlan,
    } =
      req.body;

    const member = await Member.findById(id);
    if (!member) {
      return res.status(404).json({ message: "Member not found" });
    }

    const trim = (v) => String(v ?? "").trim();
    const prevNameEn = trim(member.name);
    const prevNameMr = trim(member.nameMr);
    const prevRoomEn = trim(member.roomOwnerName);
    const prevRoomMr = trim(member.roomOwnerNameMr);

    if (name !== undefined || nameMr !== undefined) {
      const namePair = await resolveMemberPrimaryFields(
        name !== undefined ? trim(name) : prevNameEn,
        nameMr !== undefined ? trim(nameMr) : prevNameMr,
        prevNameEn,
        prevNameMr
      );
      member.name = namePair.en;
      member.nameMr = namePair.mr || "";
    }

    if (roomOwnerName !== undefined || roomOwnerNameMr !== undefined) {
      const roomPair = await resolveMemberPrimaryFields(
        roomOwnerName !== undefined ? trim(roomOwnerName) : prevRoomEn,
        roomOwnerNameMr !== undefined ? trim(roomOwnerNameMr) : prevRoomMr,
        prevRoomEn,
        prevRoomMr
      );
      member.roomOwnerName = roomPair.en;
      member.roomOwnerNameMr = roomPair.mr || "";
    }
    if (phone !== undefined) member.phone = String(phone).trim();
    if (joiningDate !== undefined) member.joiningDate = new Date(joiningDate);
    if (status) member.status = status === "Inactive" ? "Inactive" : "Active";
    if (mealPlan) {
      const normalizedMealPlan =
        mealPlan === "Dinner" ? "Dinner" : mealPlan === "Both" ? "Both" : "Lunch";
      member.mealPlan = normalizedMealPlan;
    }

    if (email !== undefined) {
      const normalizedEmail = email ? String(email).trim().toLowerCase() : "";
      const user = await User.findById(member.userId);
      if (!user) return res.status(404).json({ message: "Auth record not found" });

      if (normalizedEmail && normalizedEmail !== user.email) {
        const existing = await User.findOne({ email: normalizedEmail, role: "member" }).lean();
        if (existing) return res.status(400).json({ message: "Member email already exists" });
        user.email = normalizedEmail;
        await user.save();
      }
    }

    // Optional: admin can update member password directly (if provided).
    if (password !== undefined) {
      const trimmedPassword = String(password).trim();
      if (trimmedPassword) {
        const user = await User.findById(member.userId);
        if (!user) return res.status(404).json({ message: "Auth record not found" });
        user.password = await bcrypt.hash(trimmedPassword, 10);
        await user.save();
      }
    }

    member.statusMr = statusMrFor(member.status);
    member.mealPlanMr = mealPlanMrFor(member.mealPlan);

    await member.save();
    res.json(member);
  } catch (error) {
    console.error("Update member error:", error);
    res.status(500).json({ message: "Failed to update member" });
  }
});

// DELETE /api/members/:id - Delete a member
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const member = await Member.findById(id);
    if (!member) {
      return res.status(404).json({ message: "Member not found" });
    }

    // MongoDB does NOT cascade delete automatically.
    // Clean up all documents that reference this member.
    const memberId = member._id;
    const memberUser = member.userId ? await User.findById(member.userId).lean() : null;
    const memberEmail = memberUser?.email ? String(memberUser.email).toLowerCase().trim() : "";

    await Promise.allSettled([
      SnackOrder.deleteMany({ memberId: memberId }),
      LeaveRequest.deleteMany({ memberId: memberId }),
      LeaveStat.deleteMany({ memberId }),
      Payment.deleteMany({ memberId: memberId }),
      // Delete any OTPs that might still exist for the member email.
      memberEmail ? Otp.deleteMany({ email: memberEmail }) : Promise.resolve()
    ]);

    await Member.deleteOne({ _id: memberId });

    res.json({ message: "Member deleted successfully" });
  } catch (error) {
    console.error("Delete member error:", error);
    res.status(500).json({ message: "Failed to delete member" });
  }
});

module.exports = router;

