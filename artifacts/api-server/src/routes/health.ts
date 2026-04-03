import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";

const router: IRouter = Router();

router.get("/healthz", async (_req, res) => {
  const start = Date.now();
  let dbStatus: "ok" | "error" = "ok";
  let dbLatencyMs = 0;

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbLatencyMs = Date.now() - start;
  } catch {
    dbStatus = "error";
    dbLatencyMs = Date.now() - start;
  }

  const healthy = dbStatus === "ok";

  res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    db: {
      status: dbStatus,
      latencyMs: dbLatencyMs,
    },
  });
});

export default router;
