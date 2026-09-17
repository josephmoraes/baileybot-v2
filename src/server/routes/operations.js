import express from "express";
import importHistoryService from "../../services/importHistoryService.js";
import operationLogService from "../../services/operationLogService.js";

const router = express.Router();

router.get("/imports", (req, res) => res.json(importHistoryService.listar(req.query.limit)));
router.get("/imports/:id", (req, res) => {
    const history = importHistoryService.obter(req.params.id);
    if (!history) return res.status(404).json({ error: "Importação não encontrada." });
    res.json(history);
});
router.get("/logs", (req, res) => res.json(operationLogService.listar(req.query)));

export default router;
