import { Router, type IRouter } from "express";
import healthRouter from "./health";
import menuRouter from "./menu";
import reservationsRouter from "./reservations";
import recipesRouter from "./recipes";
import extractPdfRouter from "./extractPdf";

const router: IRouter = Router();

router.use(healthRouter);
router.use(menuRouter);
router.use(reservationsRouter);
router.use(recipesRouter);
router.use(extractPdfRouter);

export default router;
