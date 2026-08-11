import { Router } from "express";
import messagesController from "../../controllers/messagesController.js";

const router = Router();

router.get("/credit-templates", messagesController.listarTemplatesCredito);
router.put("/credit-templates/:key", messagesController.editarTemplateCredito);

router.get(
    "/templates",
    messagesController.listarTemplates
);

router.post(
    "/templates",
    messagesController.criarTemplate
);

router.put(
    "/templates/:id",
    messagesController.editarTemplate
);

router.delete(
    "/templates/:id",
    messagesController.excluirTemplate
);

router.get(
    "/history",
    messagesController.listarHistorico
);

router.delete(
    "/history",
    messagesController.limparHistorico
);

router.post(
    "/send/:id",
    messagesController.enviarMensagem
);

export default router;
