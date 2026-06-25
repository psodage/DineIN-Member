/**
 * routes/healthRoutes.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Health-check endpoint — the single most important route for Render free-tier.
 *
 * Key design decisions
 * ────────────────────
 * 1. ZERO database I/O.
 *    The endpoint must respond in < 5 ms even when MongoDB is down so that
 *    UptimeRobot pings never time-out and Render's dyno stays warm.
 *
 * 2. DB readyState is reported as metadata only.
 *    `isDBHealthy()` is a pure in-memory check (mongoose.connection.readyState)
 *    — no socket, no query, no latency.
 *
 * 3. HTTP 200 even when DB is degraded.
 *    Returning 503 would cause UptimeRobot to mark the site as "down" and stop
 *    pinging, which defeats the keep-alive purpose.  Consumers that care about
 *    DB status can read the `db` field in the response body.
 *
 * Response shape
 * ──────────────
 * {
 *   "status": "ok",
 *   "timestamp": "2025-06-25T17:00:00.000Z",
 *   "uptime": 3600.42,          // process uptime in seconds
 *   "db": "connected"           // "connected" | "disconnected" | "connecting" | "disconnecting"
 * }
 */

"use strict";

const { Router } = require("express");
const { isDBHealthy } = require("../config/db");

const router = Router();

// ─── DB readyState → human-readable label ─────────────────────────────────

/** Maps mongoose readyState integers to readable strings. */
const DB_STATE_LABELS = {
  0: "disconnected",
  1: "connected",
  2: "connecting",
  3: "disconnecting",
};

/**
 * GET /health
 * ───────────
 * Always returns HTTP 200.  Designed for:
 *  - UptimeRobot monitoring (keep-alive ping every 5 min)
 *  - Render health checks
 *  - Internal readiness probes
 */
router.get("/", (_req, res) => {
  // mongoose.connection.readyState is a synchronous integer property — no I/O.
  const { readyState } = require("mongoose").connection;

  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),       // ISO-8601 UTC timestamp
    uptime: Math.round(process.uptime()),       // seconds since process started
    db: DB_STATE_LABELS[readyState] ?? "unknown",
  });
});

module.exports = router;
