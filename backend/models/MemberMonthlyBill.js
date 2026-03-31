const mongoose = require("mongoose");

// Cache collection for computed monthly billing per member.
// Used to quickly compute "total due" without recalculating billing for every request.
const memberMonthlyBillSchema = new mongoose.Schema(
  {
    memberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Member",
      required: true,
      index: true,
    },

    // First day of month (normalized to 00:00:00 in local time zone).
    month: { type: Date, required: true, index: true },

    totalBill: { type: Number, required: true, default: 0, min: 0 },
    paidAmount: { type: Number, required: true, default: 0, min: 0 },
    remainingAmount: { type: Number, required: true, default: 0, min: 0 },
    status: { type: String, enum: ["Paid", "Pending"], default: "Pending" },

    // Breakdown (useful for future UI/reporting; not required by current screens).
    mealAmount: { type: Number, required: true, default: 0, min: 0 },
    snacksAmount: { type: Number, required: true, default: 0, min: 0 },
    expenseShare: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true }
);

memberMonthlyBillSchema.index({ memberId: 1, month: 1 }, { unique: true });

module.exports = mongoose.model(
  "MemberMonthlyBill",
  memberMonthlyBillSchema,
  "memberMonthlyBills"
);

