import { Router } from "express";
import messagesController from "../../controllers/messagesController.js";

const router = Router();

router.get(
    "/templates",
    messagesController.listarTemplates
);

router.post(
    "/send/:id",
    messagesController.enviarMensagem
);

export default router;