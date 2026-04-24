const AppSetting = require("../models/AppSetting");

const LEAVE_STREAK_REQUIRED_DAYS_KEY = "leave_streak_required_days";
const LEAVE_STREAK_REQUIRED_DAYS_DEFAULT = 5;

async function getNumericSetting(key, fallbackValue) {
  const fallback = Number(fallbackValue);
  const doc = await AppSetting.findOne({ key }).lean();

  if (doc && Number.isFinite(Number(doc.numberValue))) {
    return Number(doc.numberValue);
  }

  await AppSetting.findOneAndUpdate(
    { key },
    { $setOnInsert: { key, numberValue: fallback } },
    { upsert: true, new: false }
  );

  return fallback;
}

async function getLeaveStreakRequiredDays() {
  const value = await getNumericSetting(
    LEAVE_STREAK_REQUIRED_DAYS_KEY,
    LEAVE_STREAK_REQUIRED_DAYS_DEFAULT
  );
  return Math.max(1, Math.floor(Number(value) || LEAVE_STREAK_REQUIRED_DAYS_DEFAULT));
}

module.exports = {
  getLeaveStreakRequiredDays,
  LEAVE_STREAK_REQUIRED_DAYS_KEY,
  LEAVE_STREAK_REQUIRED_DAYS_DEFAULT,
};
