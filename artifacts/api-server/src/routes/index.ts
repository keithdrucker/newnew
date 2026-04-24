import { Router, type IRouter } from "express";
import healthRouter from "./health";
import sessionRouter from "./session";
import departmentsRouter from "./departments";
import departmentSettingsRouter from "./departmentSettings";
import boardMembersRouter from "./boardMembers";
import ticketsRouter from "./tickets";
import peopleRouter from "./people";
import agentsRouter from "./agents";
import knowledgeBaseRouter from "./knowledgeBase";
import assetsRouter from "./assets";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(sessionRouter);
router.use(departmentsRouter);
router.use(departmentSettingsRouter);
router.use(boardMembersRouter);
router.use(ticketsRouter);
router.use(peopleRouter);
router.use(agentsRouter);
router.use(knowledgeBaseRouter);
router.use(assetsRouter);
router.use(dashboardRouter);

export default router;
