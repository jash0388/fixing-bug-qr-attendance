import { Router } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import usersRouter from "./users.js";
import attendanceRouter from "./attendance.js";
import mentorRouter from "./mentor.js";

const router = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(attendanceRouter);
router.use(mentorRouter);

export default router;
