import { Router } from "express";
import { obterDashboard } from "../../controllers/dashboardController.js";

const router = Router();
router.get("/", obterDashboard);

export default router;
