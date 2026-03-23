import { Router, type IRouter } from "express";
import healthRouter from "./health";
import menuRouter from "./menu";
import reservationsRouter from "./reservations";

const router: IRouter = Router();

router.use(healthRouter);
router.use(menuRouter);
router.use(reservationsRouter);

export default router;
