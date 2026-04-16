const express = require("express");
const LeaveStat = require("../models/LeaveStat");
const MemberMonthlyBill = require("../models/MemberMonthlyBill");
const {
  authenticate,
  requireMember,
  ensureSelfParam,
} = require("../middleware/authMiddleware");
const { upsertMemberMonthlyBill } = require("../utils/memberMonthlyBillCache");

const router = express.Router();

function monthStartOf(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

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

      // Ensure monthly due cache exists for the current month.
      await upsertMemberMonthlyBill(memberId, monthStart);

      const [dueDoc, leaveStat] = await Promise.all([
        MemberMonthlyBill.findOne({ memberId, month: monthStart })
          .select("month totalBill paidAmount remainingAmount status")
          .lean(),
        LeaveStat.findOne({ memberId, month: monthStart })
          .select("inactiveDays chargeableLeaveDayKeys shortLeaveDayKeys")
          .lean(),
      ]);

      const chargeableKeys = Array.isArray(leaveStat?.chargeableLeaveDayKeys)
        ? leaveStat.chargeableLeaveDayKeys
        : [];
      const shortKeys = Array.isArray(leaveStat?.shortLeaveDayKeys)
        ? leaveStat.shortLeaveDayKeys
        : [];

      return res.json({
        memberId,
        month: monthStart,
        monthlyDue: Number(dueDoc?.remainingAmount || 0),
        totalBill: Number(dueDoc?.totalBill || 0),
        paidAmount: Number(dueDoc?.paidAmount || 0),
        monthlyStatus: dueDoc?.status || "Pending",
        inactiveDays: Number(leaveStat?.inactiveDays || 0),
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

module.exports = router;
