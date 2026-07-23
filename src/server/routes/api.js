import { Router } from "express";
import { iniciarBot } from "../../controllers/botController.js";

const router = Router();

router.post("/bot/start", iniciarBot);

export default router;