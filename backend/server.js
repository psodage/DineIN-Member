/**
 * server.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Entry point for the DineIN Member API.
 *
 * Boot order
 * ──────────
 * 1. Load environment variables (dotenv).
 * 2. Apply security middleware (helmet, cors, rate-limit).
 * 3. Mount /health BEFORE DB connect — keeps the endpoint fast always.
 * 4. Connect to MongoDB (async; server starts listening immediately so
 *    Render's health check can pass before Atlas handshake completes).
 * 5. Mount all API routes.
 * 6. Attach global error handlers (404, unhandled errors).
 * 7. Register SIGTERM/SIGINT handlers for graceful shutdown.
 */

"use strict";

// ─── 1. Environment variables ──────────────────────────────────────────────
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

// ─── 2. Core imports ───────────────────────────────────────────────────────
const express      = require("express");
const cors         = require("cors");
const helmet       = require("helmet");
const rateLimit    = require("express-rate-limit");
const morgan       = require("morgan");
const { connectDB, closeDB } = require("./config/db");
const logger       = require("./utils/logger");
const { startMonthlyBillEmailScheduler } = require("./jobs/monthlyBillEmailJob");
const { startDueSyncScheduler, stopDueSyncScheduler } = require("./jobs/syncMemberDues");

// ─── 3. App initialisation ────────────────────────────────────────────────
const app = express();

/**
 * Trust the first proxy hop (Render's load balancer) so that:
 * - req.ip reflects the real client IP, not the proxy's IP.
 * - express-rate-limit correctly buckets by client IP.
 */
app.set("trust proxy", 1);

/** Remove the "X-Powered-By: Express" header — minor info-leakage hardening. */
app.disable("x-powered-by");

// ─── 4. Security & utility middleware ────────────────────────────────────
/**
 * helmet() sets sensible HTTP security headers:
 *   - Content-Security-Policy
 *   - X-Frame-Options
 *   - X-Content-Type-Options
 *   - Strict-Transport-Security  (HTTPS only)
 *   …and more.
 */
app.use(helmet());

/**
 * CORS — restrict which origins may call the API.
 * CORS_ORIGIN env var: "*" for open access or a comma-separated list of
 * allowed origins (e.g. "https://app.dinein.com,https://admin.dinein.com").
 */
const corsOriginEnv = process.env.CORS_ORIGIN;
const corsOptions = {
  origin:
    !corsOriginEnv || corsOriginEnv === "*"
      ? "*"
      : corsOriginEnv.split(",").map((s) => s.trim()).filter(Boolean),
};
app.use(cors(corsOptions));

/**
 * morgan HTTP request logger.
 * Format: "tiny" in production (compact), "dev" locally (coloured).
 * Logs go to stdout which Render captures in its log viewer.
 */
app.use(
  morgan(process.env.NODE_ENV === "production" ? "tiny" : "dev", {
    // Skip /health so UptimeRobot pings don't pollute logs
    skip: (req) => req.path === "/health",
  })
);

/** Parse incoming JSON bodies, capped at 1 MB to block oversized payloads. */
app.use(express.json({ limit: "1mb" }));

// ─── 5. /health route (mounted BEFORE rate-limiter & DB connect) ──────────
/**
 * IMPORTANT: /health must be mounted before the API rate-limiter and before
 * connectDB() so that:
 *  - UptimeRobot pings are never rate-limited.
 *  - The endpoint responds even if the DB is still connecting.
 */
app.use("/health", require("./routes/healthRoutes"));

// ─── 6. API rate limiter ──────────────────────────────────────────────────
/**
 * Global rate limit on all /api/* routes.
 * 300 requests per 15-minute window per IP.
 * Increase this in RATE_LIMIT_MAX env var if legitimate traffic is being
 * throttled (e.g., mobile app doing many rapid requests).
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: Number(process.env.RATE_LIMIT_MAX) || 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});
app.use("/api", apiLimiter);

// ─── 7. API routes ────────────────────────────────────────────────────────
app.use("/api/auth",                   require("./routes/authRoutes"));
app.use("/api/menu",                   require("./routes/menuRoutes"));
app.use("/api/polls",                  require("./routes/pollRoutes"));
app.use("/api/members",                require("./routes/memberRoutes"));
app.use("/api/pending-registrations",  require("./routes/pendingRegistrationRoutes"));
// Normalised alias: /api/member → memberRoutes (preferred going forward)
app.use("/api/member",                 require("./routes/memberRoutes"));
// Backward-compatible alias: older app builds may still call /api/students
app.use("/api/students",               require("./routes/memberRoutes"));
app.use("/api/expenses",               require("./routes/expenseRoutes"));
app.use("/api/snacks",                 require("./routes/snackRoutes"));
app.use("/api/payments",               require("./routes/paymentRoutes"));
app.use("/api/snack-products",         require("./routes/snackProductRoutes"));
app.use("/api/snack-orders",           require("./routes/snackOrderRoutes"));
app.use("/api/bill-splits",            require("./routes/billSplitRoutes"));
app.use("/api/leave",                  require("./routes/leaveRoutes"));
app.use("/api/meal-types",             require("./routes/mealTypeRoutes"));
app.use("/api/member-monthly-due",     require("./routes/MemberMonthlyDue"));

// ─── 8. 404 handler ───────────────────────────────────────────────────────
/**
 * Catch-all for routes that don't exist.
 * Returns JSON instead of Express's default HTML 404 page.
 */
app.use((_req, res) => {
  res.status(404).json({ error: "Route not found." });
});

// ─── 9. Global error handler ──────────────────────────────────────────────
/**
 * Express's error-handling middleware signature requires exactly 4 params.
 * Any route that calls next(err) lands here.
 */
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  logger.error("Unhandled error:", err);

  // Don't leak stack traces to clients in production
  const message =
    process.env.NODE_ENV === "production"
      ? "An internal server error occurred."
      : err.message;

  res.status(err.status || 500).json({ error: message });
});

// ─── 10. Start listening ───────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, async () => {
  logger.info(`🚀 Server listening on port ${PORT} [${process.env.NODE_ENV || "development"}]`);

  // Log email config status so Render logs make the issue obvious if missing
  const hasEmail = !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
  logger.info(`Nodemailer (Gmail SMTP) configured: ${hasEmail ? "yes" : "no"}`);

  // Connect to MongoDB asynchronously after the HTTP server is up.
  // This ensures /health responds immediately even on cold-start while Atlas
  // is still completing its TCP handshake.
  await connectDB();

  // Start scheduled jobs only after DB is confirmed live
  startMonthlyBillEmailScheduler();
  logger.info("Monthly bill email scheduler started.");

  // Auto-calculate and sync MemberMonthlyDue for every active member
  startDueSyncScheduler();
});

// ─── 11. Graceful shutdown ─────────────────────────────────────────────────
/**
 * Render sends SIGTERM when deploying a new version or scaling down.
 * We close the HTTP server first (stops accepting new connections), then
 * close MongoDB to avoid write errors on in-flight requests.
 *
 * 10-second hard timeout forces exit if shutdown hangs (e.g., long-running
 * DB operation), preventing the process from being stuck in SIGTERM limbo.
 */
async function gracefulShutdown(signal) {
  logger.info(`${signal} received — starting graceful shutdown…`);

  // Hard-kill timeout: if shutdown takes > 10 s, force exit
  const hardKillTimer = setTimeout(() => {
    logger.error("Graceful shutdown timed out — forcing exit.");
    process.exit(1);
  }, 10_000);
  hardKillTimer.unref(); // Don't keep the event loop alive just for this timer

  try {
    // 1. Stop accepting new HTTP requests
    await new Promise((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
    logger.info("HTTP server closed.");

    // 2. Stop scheduled jobs
    stopDueSyncScheduler();

    // 3. Close MongoDB connection cleanly (prevents reconnect loop in closeDB)
    await closeDB();

    clearTimeout(hardKillTimer);
    logger.info("Graceful shutdown complete. Bye 👋");
    process.exit(0);
  } catch (err) {
    logger.error("Error during graceful shutdown:", err.message);
    process.exit(1);
  }
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT",  () => gracefulShutdown("SIGINT"));

// ─── 12. Unhandled rejection / uncaught exception guards ─────────────────
/**
 * Safety nets: log and exit so Render restarts the dyno automatically
 * rather than leaving the process running in a broken state.
 */
process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled Promise rejection:", reason);
  process.exit(1);
});

process.on("uncaughtException", (err) => {
  logger.error("Uncaught exception:", err);
  process.exit(1);
});