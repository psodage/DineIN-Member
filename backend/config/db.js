"use strict";

/**
 * config/db.js
 * ─────────────────────────────────────────────────────────────────────────────
 * MongoDB connection management via Mongoose.
 *
 * Design goals
 * ────────────
 * • Connect once at startup; Mongoose buffers queries automatically.
 * • On unexpected disconnect, retry with exponential back-off so the
 *   process stays alive and Render keeps serving /health pings.
 * • Expose a zero-I/O `isDBHealthy()` helper for the /health route.
 * • Support graceful shutdown via `closeDB()` (called on SIGTERM/SIGINT).
 */

const mongoose = require("mongoose");

// ─── Reconnection state ────────────────────────────────────────────────────

/** Running count of reconnect attempts since the last clean connection. */
let _reconnectAttempts = 0;

/** Hard cap on retry delay to avoid waiting longer than 30 s. */
const MAX_RETRY_DELAY_MS = 30_000;

/**
 * Exponential back-off with ±20 % jitter.
 * attempt 0 → ~1 s | attempt 3 → ~8 s | attempt 5+ → ~30 s (capped)
 */
function _backOffDelay(attempt) {
  const base = Math.min(1_000 * 2 ** attempt, MAX_RETRY_DELAY_MS);
  return base + Math.random() * base * 0.2; // add jitter
}

// ─── Mongoose connection options ───────────────────────────────────────────

const MONGOOSE_OPTS = {
  // Give up picking a server after 5 s (keeps cold-start failures fast).
  serverSelectionTimeoutMS: 5_000,

  // Max time an individual operation may wait for a reply from Atlas.
  socketTimeoutMS: 45_000,

  // How often Mongoose polls Atlas for server health changes.
  heartbeatFrequencyMS: 10_000,
};

// ─── Internal connect helper ───────────────────────────────────────────────

async function _connect() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error(
      "MONGODB_URI is not set. Check your .env file or Render environment settings."
    );
  }

  // mongoose.connect() is idempotent when already connected.
  await mongoose.connect(uri, MONGOOSE_OPTS);
}

// ─── Reconnection loop ─────────────────────────────────────────────────────

/**
 * Triggered by the "disconnected" event.
 * Retries indefinitely with exponential back-off so Render's dyno can stay
 * alive while Atlas recovers — UptimeRobot keep-alive pings will still
 * hit /health and get a fast response even while the DB is down.
 */
function _scheduleReconnect() {
  if (_isShuttingDown) return; // don't retry during intentional shutdown

  _reconnectAttempts += 1;
  const delay = _backOffDelay(_reconnectAttempts);

  console.warn(
    `[DB] Disconnected — reconnect attempt #${_reconnectAttempts} in ${Math.round(delay / 1_000)} s…`
  );

  setTimeout(async () => {
    try {
      await _connect();
      _reconnectAttempts = 0; // reset on success
      console.log("[DB] Reconnected to MongoDB.");
    } catch (err) {
      // "disconnected" will fire again → triggers another _scheduleReconnect
      console.error("[DB] Reconnect attempt failed:", err.message);
    }
  }, delay);
}

// ─── Mongoose event listeners (registered once at module load) ─────────────

mongoose.connection.on("connected", () =>
  console.log("[DB] MongoDB connection open.")
);
mongoose.connection.on("error", (err) =>
  console.error("[DB] Mongoose error:", err.message)
);
mongoose.connection.on("disconnected", _scheduleReconnect);

// ─── Graceful shutdown flag ────────────────────────────────────────────────

let _isShuttingDown = false;

/**
 * closeDB()
 * Closes the Mongoose connection cleanly.
 * Call this from SIGTERM / SIGINT handlers before exiting so the
 * "disconnected" event does NOT trigger a pointless reconnect loop.
 */
async function closeDB() {
  _isShuttingDown = true;
  try {
    await mongoose.connection.close();
    console.log("[DB] MongoDB connection closed cleanly.");
  } catch (err) {
    console.error("[DB] Error closing connection:", err.message);
  }
}

// ─── Public health helper ──────────────────────────────────────────────────

/**
 * isDBHealthy()
 * Returns true when Mongoose readyState is "connected" (1).
 * This is a pure in-memory check — zero network I/O — making it safe
 * to call from the /health endpoint without adding any latency.
 *
 * readyState values:
 *   0 = disconnected | 1 = connected | 2 = connecting | 3 = disconnecting
 */
function isDBHealthy() {
  return mongoose.connection.readyState === 1;
}

// ─── One-time data migrations ──────────────────────────────────────────────

/**
 * Renames the legacy "students" collection → "members" and the matching
 * counter document. Runs once per startup; failures are non-fatal.
 */
async function _runMigrations() {
  try {
    const db = mongoose.connection.db;
    const collections = await db
      .listCollections({}, { nameOnly: true })
      .toArray();
    const names = new Set(collections.map((c) => c.name));

    // Rename collection
    if (names.has("students") && !names.has("members")) {
      await db.collection("students").rename("members");
      console.log('[DB] Migration: renamed "students" → "members".');
    }

    // Rename counter document
    if (names.has("counters")) {
      const coll = db.collection("counters");
      const oldDoc = await coll.findOne({ name: "studentRollNumber" });
      const newDoc = await coll.findOne({ name: "memberRollNumber" });

      if (oldDoc && !newDoc) {
        await coll.updateOne(
          { _id: oldDoc._id },
          { $set: { name: "memberRollNumber" } }
        );
        console.log('[DB] Migration: renamed counter "studentRollNumber" → "memberRollNumber".');
      } else if (oldDoc && newDoc) {
        const maxSeq = Math.max(
          Number(oldDoc.seq || 0),
          Number(newDoc.seq || 0)
        );
        await coll.updateOne({ _id: newDoc._id }, { $set: { seq: maxSeq } });
        await coll.deleteOne({ _id: oldDoc._id });
        console.log('[DB] Migration: merged counters into "memberRollNumber".');
      }
    }
  } catch (err) {
    // Migrations failing must never crash the server.
    console.warn("[DB] Migration skipped / failed:", err.message);
  }
}

// ─── Main export ───────────────────────────────────────────────────────────

/**
 * connectDB()
 * Call once at application startup.
 * On initial failure it exits with code 1 so Render restarts the dyno.
 * After that, `_scheduleReconnect` handles recovery automatically.
 */
async function connectDB() {
  try {
    await _connect();
    console.log("[DB] MongoDB connected successfully.");
    await _runMigrations();
  } catch (err) {
    console.error("[DB] Initial connection failed:", err.message);
    process.exit(1); // Let Render restart the dyno
  }
}

module.exports = { connectDB, closeDB, isDBHealthy };