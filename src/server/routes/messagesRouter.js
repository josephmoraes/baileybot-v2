import { Router } from "express";
import messagesController from "../../controllers/messagesController.js";

const router = Router();

router.get(
    "/templates",
    messagesController.listarTemplates
);

router.get(
    "/history",
    messagesController.listarHistorico
);

router.post(
    "/send/:id",
    messagesController.enviarMensagem
);

export default router;