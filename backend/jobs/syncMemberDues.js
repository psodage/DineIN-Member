"use strict";

/**
 * jobs/syncMemberDues.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Automatically calculates and upserts MemberMonthlyDue records for every
 * active member, for every month from their createdAt date up to the current
 * month. Runs once on server startup and then daily via setInterval.
 */

const Member = require("../models/Member");
const MemberMonthlyDue = require("../models/MemberMonthlyDue");
const { calculateMemberBilling } = require("../utils/billing");
const logger = require("../utils/logger");

/**
 * Return the first day of the month for a given date (local time).
 */
function monthStartOf(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

/**
 * Advance a month-start date by one month.
 */
function nextMonth(monthStart) {
  return new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1, 0, 0, 0, 0);
}

/**
 * For a single member, compute billing for every month from their createdAt
 * (or joiningDate, whichever is earlier) through the current month, and
 * upsert the MemberMonthlyDue document for each.
 */
async function syncDuesForMember(member) {
  const now = new Date();
  const currentMonthStart = monthStartOf(now);

  // Determine earliest month to start from
  const createdAt = member.createdAt ? new Date(member.createdAt) : null;
  const joiningDate = member.joiningDate ? new Date(member.joiningDate) : null;

  let earliest = createdAt || joiningDate || currentMonthStart;
  if (joiningDate && joiningDate < earliest) earliest = joiningDate;

  let cursor = monthStartOf(earliest);
  let upserted = 0;

  while (cursor <= currentMonthStart) {
    try {
      const billing = await calculateMemberBilling(member._id, cursor);
      if (billing) {
        await MemberMonthlyDue.findOneAndUpdate(
          { memberId: member._id, month: cursor },
          {
            $set: {
              userId: member.userId,
              month: cursor,
              due: billing.remainingAmount,
              collected: billing.paidAmount,
              status: billing.status,
              lastChargedDate: now,
            },
          },
          { upsert: true, new: true }
        );
        upserted++;
      }
    } catch (err) {
      logger.error(
        `syncDuesForMember: failed for member ${member._id} month ${cursor.toISOString()}: ${err.message}`
      );
    }
    cursor = nextMonth(cursor);
  }

  return upserted;
}

/**
 * Sync dues for ALL active members across all applicable months.
 */
async function syncAllMemberDues() {
  const startTime = Date.now();
  logger.info("syncAllMemberDues: starting...");

  try {
    const members = await Member.find({ status: "Active" })
      .select("_id userId createdAt joiningDate")
      .lean();

    let totalUpserted = 0;
    for (const member of members) {
      const count = await syncDuesForMember(member);
      totalUpserted += count;
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info(
      `syncAllMemberDues: completed — ${members.length} members, ${totalUpserted} due records upserted in ${elapsed}s`
    );
  } catch (err) {
    logger.error(`syncAllMemberDues: fatal error — ${err.message}`);
  }
}

// 24 hours in ms
const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

let _intervalHandle = null;

/**
 * Start the due-sync scheduler: runs immediately once, then every 24 hours.
 */
function startDueSyncScheduler() {
  // Run immediately (non-blocking)
  syncAllMemberDues();

  // Then repeat daily
  _intervalHandle = setInterval(syncAllMemberDues, SYNC_INTERVAL_MS);
  logger.info("Due-sync scheduler started (runs every 24h).");
}

/**
 * Stop the scheduler (for graceful shutdown).
 */
function stopDueSyncScheduler() {
  if (_intervalHandle) {
    clearInterval(_intervalHandle);
    _intervalHandle = null;
    logger.info("Due-sync scheduler stopped.");
  }
}

module.exports = {
  syncAllMemberDues,
  syncDuesForMember,
  startDueSyncScheduler,
  stopDueSyncScheduler,
};
