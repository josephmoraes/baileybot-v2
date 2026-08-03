import { Router } from "express";
import campaignController from "../../controllers/campaignController.js";

const router = Router();

router.get(
    "/",
    campaignController.listar
);

router.get(
    "/:id/recipients",
    campaignController.listarDestinatarios
);

router.put(
    "/:id/recipients",
    campaignController.salvarDestinatarios
);

router.post(
    "/:id/send",
    campaignController.enviar
);

router.get(
    "/:id",
    campaignController.buscarPorId
);

router.post(
    "/",
    campaignController.criar
);

router.put(
    "/:id",
    campaignController.atualizar
);

router.delete(
    "/:id",
    campaignController.excluir
);



export default router;
