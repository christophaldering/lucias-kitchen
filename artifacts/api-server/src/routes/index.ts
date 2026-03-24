import { Router, type IRouter } from "express";
import healthRouter from "./health";
import menuRouter from "./menu";
import reservationsRouter from "./reservations";
import recipesRouter from "./recipes";
import extractPdfRouter from "./extractPdf";
import extractUrlRouter from "./extractUrl";
import extractImageRouter from "./extractImage";
import extractFridgeRouter from "./extractFridge";
import mealPlansRouter from "./mealPlans";
import uploadImageRouter from "./uploadImage";
import authRouter from "./auth";
import suggestWeekRouter from "./suggestWeek";
import groupsRouter from "./groups";

const router: IRouter = Router();

router.use(healthRouter);
router.use(menuRouter);
router.use(reservationsRouter);
router.use(recipesRouter);
router.use(extractPdfRouter);
router.use(extractUrlRouter);
router.use(extractImageRouter);
router.use(extractFridgeRouter);
router.use(mealPlansRouter);
router.use(uploadImageRouter);
router.use(authRouter);
router.use(suggestWeekRouter);
router.use(groupsRouter);

export default router;
