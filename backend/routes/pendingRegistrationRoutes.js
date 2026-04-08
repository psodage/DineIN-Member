const express = require("express");
const bcrypt = require("bcryptjs");
const PendingRegistration = require("../models/PendingRegistration");
const User = require("../models/User");
const Member = require("../models/Member");

const router = express.Router();

// POST /api/pending-registrations
// Creates a pending member registration (awaiting admin approval).
router.post("/", async (req, res) => {
  try {
    const trim = (v) => String(v ?? "").trim();
    const normalizePhoneDigits = (raw) => String(raw ?? "").replace(/\D/g, "");

    const name = trim(req.body?.name);
    const roomOwnerName = trim(req.body?.roomOwnerName);
    const phone = trim(req.body?.phone);
    const email = trim(req.body?.email).toLowerCase();
    const password = trim(req.body?.password);
    const mealPlanRaw = trim(req.body?.mealPlan);

    const mealPlan =
      mealPlanRaw === "Dinner" ? "Dinner" : mealPlanRaw === "Both" ? "Both" : "Lunch";

    if (!name || !roomOwnerName || !phone || !email || !password) {
      return res.status(400).json({
        message: "Name, room owner name, phone, email and password are required",
      });
    }

    // Basic format validation (backend enforcement; frontend also validates).
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailOk) {
      return res.status(400).json({ message: "Invalid email address" });
    }

    const phoneDigits = normalizePhoneDigits(phone);
    if (!phoneDigits || phoneDigits.length < 10 || phoneDigits.length > 15) {
      return res.status(400).json({ message: "Invalid phone number" });
    }

    // Prevent duplicate registrations for an existing member account.
    const existingUser = await User.findOne({ email, role: "member" }).lean();
    if (existingUser) {
      return res.status(400).json({ message: "Member email already exists" });
    }

    const existingPending = await PendingRegistration.findOne({ email }).lean();
    if (existingPending) {
      return res.status(400).json({ message: "Registration already pending for this email" });
    }

    // Also prevent duplicates by phone across existing members + pending registrations.
    const existingMemberByPhone = await Member.findOne({
      phone: { $in: [phone, phoneDigits, `+${phoneDigits}`] },
    }).lean();
    if (existingMemberByPhone) {
      return res.status(400).json({ message: "Member phone already exists" });
    }

    const existingPendingByPhone = await PendingRegistration.findOne({
      phone: { $in: [phone, phoneDigits, `+${phoneDigits}`] },
    }).lean();
    if (existingPendingByPhone) {
      return res
        .status(400)
        .json({ message: "Registration already pending for this phone" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const pending = await PendingRegistration.create({
      name,
      phone,
      roomOwnerName,
      mealPlan,
      email,
      passwordHash,
    });

    return res.status(201).json({
      message: "Registration submitted for approval",
      pendingRegistrationId: pending._id,
    });
  } catch (error) {
    console.error("Create pending registration error:", error);
    return res.status(500).json({ message: "Failed to submit registration" });
  }
});

module.exports = router;

