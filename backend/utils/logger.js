/**
 * utils/logger.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Lightweight structured logger.
 *
 * Why not winston/pino?
 *   • Keeps the dependency footprint (and cold-start time) minimal.
 *   • Render streams stdout/stderr to its log viewer automatically.
 *   • A simple wrapper is enough for a small API; swap for pino if you need
 *     log-level filtering or JSON shipping to Datadog/Logtail later.
 *
 * Usage:
 *   const logger = require('./utils/logger');
 *   logger.info('Server started');
 *   logger.warn('High memory usage');
 *   logger.error('DB connection failed', err);
 */

"use strict";

/** Returns a compact ISO-8601 timestamp string, e.g. "2025-06-25T16:42:01.123Z" */
const ts = () => new Date().toISOString();

const logger = {
  /**
   * Log informational messages (routine lifecycle events).
   * @param {...any} args
   */
  info(...args) {
    console.log(`[${ts()}] INFO `, ...args);
  },

  /**
   * Log warnings (recoverable issues, degraded state).
   * @param {...any} args
   */
  warn(...args) {
    console.warn(`[${ts()}] WARN `, ...args);
  },

  /**
   * Log errors (unhandled exceptions, fatal conditions).
   * @param {...any} args
   */
  error(...args) {
    console.error(`[${ts()}] ERROR`, ...args);
  },

  /**
   * Log debug messages — only emitted when NODE_ENV is not "production".
   * @param {...any} args
   */
  debug(...args) {
    if (process.env.NODE_ENV !== "production") {
      console.debug(`[${ts()}] DEBUG`, ...args);
    }
  },
};

module.exports = logger;
