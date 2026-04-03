import createApp from "./app";
import { logger } from "./lib/logger";
import { startSlaEnforcer } from "./lib/slaEnforcer";
import { startReminderScheduler } from "./lib/reminderScheduler";
import { pool } from "./lib/sessionPool";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

createApp().then((app) => {
  const server = app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");

    // Start background jobs
    startSlaEnforcer(60_000); // Check for expired bookings every 60 seconds
    startReminderScheduler(5 * 60 * 1000); // Send booking reminders every 5 minutes
  });

  // Graceful shutdown
  const shutdown = (signal: string) => {
    logger.info({ signal }, "Received shutdown signal, closing server...");

    server.close(() => {
      logger.info("HTTP server closed");

      pool.end().then(() => {
        logger.info("Session pool closed");
        process.exit(0);
      }).catch((poolErr) => {
        logger.error({ err: poolErr }, "Error closing session pool");
        process.exit(1);
      });
    });

    // Force shutdown after 10 seconds if graceful shutdown stalls
    setTimeout(() => {
      logger.error("Graceful shutdown timed out, forcing exit");
      process.exit(1);
    }, 10_000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}).catch((err) => {
  logger.error({ err }, "Failed to create app");
  process.exit(1);
});
