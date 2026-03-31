const { calculateMemberBilling } = require("./billing");
const MemberMonthlyBill = require("../models/MemberMonthlyBill");

function normalizeMonthStartLocal(monthDate) {
  const d = monthDate instanceof Date ? monthDate : new Date(monthDate);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

async function upsertMemberMonthlyBill(memberId, monthDate) {
  const normalized = normalizeMonthStartLocal(monthDate);
  if (!normalized) return null;

  const billing = await calculateMemberBilling(memberId, normalized);
  if (!billing) return null;

  const doc = {
    memberId,
    month: billing.month,
    totalBill: Number(billing.totalBill || 0),
    paidAmount: Number(billing.paidAmount || 0),
    remainingAmount: Number(billing.remainingAmount || 0),
    status: billing.status || (Number(billing.remainingAmount) <= 0 ? "Paid" : "Pending"),
    mealAmount: Number(billing.mealAmount || 0),
    snacksAmount: Number(billing.snacksAmount || 0),
    expenseShare: Number(billing.expenseShare || 0),
  };

  await MemberMonthlyBill.findOneAndUpdate(
    { memberId: doc.memberId, month: doc.month },
    { $set: doc },
    { upsert: true, new: false }
  );

  return doc;
}

module.exports = {
  upsertMemberMonthlyBill,
  normalizeMonthStartLocal,
};

