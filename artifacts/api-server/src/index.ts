import createApp from "./app";
import { logger } from "./lib/logger";
import { startSlaEnforcer } from "./lib/slaEnforcer";

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
  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");

    // Start background jobs
    startSlaEnforcer(60_000); // Check for expired bookings every 60 seconds
  });
}).catch((err) => {
  logger.error({ err }, "Failed to create app");
  process.exit(1);
});
