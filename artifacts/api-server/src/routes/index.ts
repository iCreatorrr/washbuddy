import { Router, type IRouter } from "express";
import stripeWebhooksRouter from "./stripeWebhooks";
import healthRouter from "./health";
import authRouter from "./auth";
import providersRouter from "./providers";
import locationsRouter from "./locations";
import servicesRouter from "./services";
import vehiclesRouter from "./vehicles";
import availabilityRouter from "./availability";
import bookingsRouter from "./bookings";
import reviewsRouter from "./reviews";
import notificationsRouter from "./notifications";
import fleetRouter from "./fleet";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(stripeWebhooksRouter);
router.use(healthRouter);
router.use(authRouter);
router.use(adminRouter);
router.use(providersRouter);
router.use(locationsRouter);
router.use(servicesRouter);
router.use(vehiclesRouter);
router.use(availabilityRouter);
router.use(bookingsRouter);
router.use(reviewsRouter);
router.use(notificationsRouter);
router.use(fleetRouter);

export default router;
