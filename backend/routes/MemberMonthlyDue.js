const express = require("express");
const LeaveStat = require("../models/LeaveStat");
const Member = require("../models/Member");
const MealType = require("../models/MealType");
const MemberMonthlyDue = require("../models/MemberMonthlyDue");
const {
  authenticate,
  requireMember,
  ensureSelfParam,
} = require("../middleware/authMiddleware");
const { calculateMemberBilling } = require("../utils/billing");

const router = express.Router();

function monthStartOf(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function parseMonthParamToLocalMonthStart(monthParam) {
  if (!monthParam) return monthStartOf(new Date());
  const s = String(monthParam).trim();
  const m = s.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (m) {
    const year = Number(m[1]);
    const monthIndex = Number(m[2]) - 1;
    return monthStartOf(new Date(year, monthIndex, 1));
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return monthStartOf(new Date());
  return monthStartOf(d);
}

function monthEndExclusiveOf(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1, 0, 0, 0, 0);
}

function dateOnlyLocal(dateLike) {
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function daysInclusive(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  if (endDate.getTime() < startDate.getTime()) return 0;
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((endDate.getTime() - startDate.getTime()) / msPerDay) + 1;
}

async function getMealPlanPrice(mealPlan) {
  const normalized = String(mealPlan || "").trim();
  if (!normalized) return 0;

  const exact = await MealType.findOne({ mealPlan: normalized })
    .select("price")
    .lean();
  if (exact) return Number(exact.price || 0);

  const fallback = await MealType.findOne({
    mealPlan: new RegExp(`^${normalized}$`, "i"),
  })
    .select("price")
    .lean();
  return Number(fallback?.price || 0);
}

function getLeaveDeductionRate(mealPlan) {
  const normalized = String(mealPlan || "").trim().toLowerCase();
  return normalized === "both" ? 100 : 60;
}

function buildMealSummary({ memberDoc, monthStart, inactiveDays, dailyRate }) {
  const monthEndInclusive = new Date(monthEndExclusiveOf(monthStart).getTime() - 1);
  const monthEndDateOnly = dateOnlyLocal(monthEndInclusive);
  const joinDateOnly = dateOnlyLocal(memberDoc?.joiningDate || monthStart);
  const monthStartDateOnly = dateOnlyLocal(monthStart);
  const eligibleStart =
    joinDateOnly && joinDateOnly.getTime() > monthStartDateOnly.getTime()
      ? joinDateOnly
      : monthStartDateOnly;

  const now = new Date();
  const isCurrentMonth =
    now.getFullYear() === monthStart.getFullYear() &&
    now.getMonth() === monthStart.getMonth();
  const cappedEnd = isCurrentMonth ? dateOnlyLocal(now) : monthEndDateOnly;
  const eligibleEnd =
    cappedEnd && cappedEnd.getTime() < monthEndDateOnly.getTime() ? cappedEnd : monthEndDateOnly;

  const eligibleDays = daysInclusive(eligibleStart, eligibleEnd);
  const leaveDeductionRate = getLeaveDeductionRate(memberDoc?.mealPlan);
  const rawLeaveDeduction = Math.max(0, Number(inactiveDays || 0) * leaveDeductionRate);
  const grossMealAmount = Math.max(0, eligibleDays * Number(dailyRate || 0));
  const leaveDeduction = Math.min(grossMealAmount, rawLeaveDeduction);
  const mealAmount = Math.round(Math.max(0, grossMealAmount - leaveDeduction));

  return {
    eligibleDays,
    grossMealAmount: Math.round(grossMealAmount),
    leaveDeduction: Math.round(leaveDeduction),
    mealAmount,
  };
}

/**
 * GET /api/member-monthly-due/:memberId?month=YYYY-MM
 * Member-only endpoint for selected month due + inactive day keys.
 */
router.get(
  "/:memberId",
  authenticate,
  requireMember,
  ensureSelfParam("memberId"),
  async (req, res) => {
    try {
      const { memberId } = req.params;
      const monthStart = parseMonthParamToLocalMonthStart(req.query?.month);

      // Prefer the explicit MemberMonthlyDue table if present; otherwise compute on demand.
      const [dueDoc, computedDoc, leaveStat, memberDoc] = await Promise.all([
        MemberMonthlyDue.findOne({ memberId, month: monthStart })
          .select("month due collected status lastChargedDate")
          .lean(),
        calculateMemberBilling(memberId, monthStart),
        LeaveStat.findOne({ memberId, month: monthStart })
          .select("inactiveDays chargeableLeaveDayKeys shortLeaveDayKeys")
          .lean(),
        Member.findById(memberId).select("mealPlan joiningDate").lean(),
      ]);

      const chargeableKeys = Array.isArray(leaveStat?.chargeableLeaveDayKeys)
        ? leaveStat.chargeableLeaveDayKeys
        : [];
      const shortKeys = Array.isArray(leaveStat?.shortLeaveDayKeys)
        ? leaveStat.shortLeaveDayKeys
        : [];

      // Shape kept stable for the mobile app.
      const hasExplicitDue = dueDoc?.due != null;
      const hasExplicitCollected = dueDoc?.collected != null;
      const explicitDue = hasExplicitDue ? Number(dueDoc.due || 0) : 0;
      const explicitCollected = hasExplicitCollected ? Number(dueDoc.collected || 0) : 0;
      const explicitStatus = dueDoc?.status || null;
      const totalBill = Number(computedDoc?.totalBill || 0);
      const paidAmount = hasExplicitCollected
        ? explicitCollected
        : Number(computedDoc?.paidAmount || 0);
      const remainingAmount = hasExplicitDue
        ? explicitDue
        : Number(computedDoc?.remainingAmount || 0);
      const computedStatus = computedDoc?.status || "Pending";
      const snacksAmount = Number(computedDoc?.snacksAmount || 0);
      const expenseShare = Number(computedDoc?.expenseShare || 0);
      const inactiveDays = Number(leaveStat?.inactiveDays || 0);
      const monthlyPrice = await getMealPlanPrice(memberDoc?.mealPlan);
      const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
      const dailyRate = daysInMonth > 0 ? monthlyPrice / daysInMonth : 0;
      const leaveDeductionRate = getLeaveDeductionRate(memberDoc?.mealPlan);
      const mealSummary = buildMealSummary({
        memberDoc,
        monthStart,
        inactiveDays,
        dailyRate,
      });
      const mealAmount = mealSummary.mealAmount;
      const leaveDeduction = mealSummary.leaveDeduction;

      return res.json({
        memberId,
        month: monthStart,
        // Preferred fields
        monthlyDue: remainingAmount,
        totalBill,
        paidAmount,
        monthlyStatus: explicitStatus || computedStatus,
        // Additional useful fields (safe for backwards compatibility)
        mealAmount,
        snacksAmount,
        expenseShare,
        leaveDeduction,
        dailyRate,
        remainingAmount,
        inactiveDays,
        inactiveDayKeys: Array.from(new Set([...chargeableKeys, ...shortKeys])).sort(),
      });
    } catch (error) {
      console.error("Get member month due/leave summary error:", error);
      return res.status(500).json({ message: "Failed to fetch month due summary" });
    }
  }
);

/**
 * GET /api/member-monthly-due/:memberId/current
 * Member-only endpoint for current month monthly due + inactive day keys.
 */
router.get(
  "/:memberId/current",
  authenticate,
  requireMember,
  ensureSelfParam("memberId"),
  async (req, res) => {
    try {
      const { memberId } = req.params;
      const monthStart = monthStartOf(new Date());

      const [monthlyDueDoc, computedDoc, leaveStat, memberDoc] = await Promise.all([
        MemberMonthlyDue.findOne({ memberId, month: monthStart })
          .select("month due collected status lastChargedDate")
          .lean(),
        calculateMemberBilling(memberId, monthStart),
        LeaveStat.findOne({ memberId, month: monthStart })
          .select("inactiveDays chargeableLeaveDayKeys shortLeaveDayKeys")
          .lean(),
        Member.findById(memberId).select("mealPlan joiningDate").lean(),
      ]);

      const chargeableKeys = Array.isArray(leaveStat?.chargeableLeaveDayKeys)
        ? leaveStat.chargeableLeaveDayKeys
        : [];
      const shortKeys = Array.isArray(leaveStat?.shortLeaveDayKeys)
        ? leaveStat.shortLeaveDayKeys
        : [];

      const hasExplicitDue = monthlyDueDoc?.due != null;
      const hasExplicitCollected = monthlyDueDoc?.collected != null;
      const explicitDue = hasExplicitDue ? Number(monthlyDueDoc.due || 0) : 0;
      const explicitCollected = hasExplicitCollected ? Number(monthlyDueDoc.collected || 0) : 0;
      const totalBill = Number(computedDoc?.totalBill || 0);
      const inactiveDays = Number(leaveStat?.inactiveDays || 0);
      const monthlyPrice = await getMealPlanPrice(memberDoc?.mealPlan);
      const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
      const dailyRate = daysInMonth > 0 ? monthlyPrice / daysInMonth : 0;
      const leaveDeductionRate = getLeaveDeductionRate(memberDoc?.mealPlan);
      const mealSummary = buildMealSummary({
        memberDoc,
        monthStart,
        inactiveDays,
        dailyRate,
      });
      const mealAmount = mealSummary.mealAmount;
      const leaveDeduction = mealSummary.leaveDeduction;
      const snacksAmount = Number(computedDoc?.snacksAmount || 0);
      const expenseShare = Number(computedDoc?.expenseShare || 0);

      return res.json({
        memberId,
        month: monthStart,
        monthlyDue: hasExplicitDue
          ? explicitDue
          : Number(computedDoc?.remainingAmount || 0),
        totalBill,
        paidAmount: hasExplicitCollected
          ? explicitCollected
          : Number(computedDoc?.paidAmount || 0),
        monthlyStatus: monthlyDueDoc?.status || computedDoc?.status || "Pending",
        mealAmount,
        snacksAmount,
        expenseShare,
        leaveDeduction,
        dailyRate,
        inactiveDays,
        inactiveDayKeys: Array.from(new Set([...chargeableKeys, ...shortKeys])).sort(),
      });
    } catch (error) {
      console.error("Get member current month due/leave summary error:", error);
      return res
        .status(500)
        .json({ message: "Failed to fetch current month due summary" });
    }
  }
);

/**
 * GET /api/member-monthly-due/:memberId/history
 * Member-only endpoint for monthly due history.
 */
router.get(
  "/:memberId/history",
  authenticate,
  requireMember,
  ensureSelfParam("memberId"),
  async (req, res) => {
    try {
      const { memberId } = req.params;
      const fetchAll =
        String(req.query?.all || "")
          .trim()
          .toLowerCase() === "true";
      const limit = Math.max(1, Math.min(24, Number(req.query?.limit || 12)));

      let query = MemberMonthlyDue.find({ memberId })
        .select("month due collected status")
        .sort({ month: -1 })
        .lean();

      if (!fetchAll) {
        query = query.limit(limit);
      }

      const rows = await query;

      return res.json(
        rows.map((row) => {
          const due = Number(row?.due || 0);
          const collected = Number(row?.collected || 0);
          return {
            _id: row?._id,
            month: row?.month,
            due,
            collected,
            totalBill: due + collected,
            status: row?.status || "Pending",
          };
        })
      );
    } catch (error) {
      console.error("Get member monthly due history error:", error);
      return res.status(500).json({ message: "Failed to fetch monthly due history" });
    }
  }
);

module.exports = router;
