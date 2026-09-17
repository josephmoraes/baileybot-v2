import express from "express";
import userService from "../../services/userService.js";
import excelService from "../../services/excel.js";
import importHistoryService from "../../services/importHistoryService.js";

const router = express.Router();

router.get("/imports/history", (req, res) => res.json(importHistoryService.listar(req.query.limit)));
router.get("/imports/history/:id", (req, res) => {
    const history = importHistoryService.obter(req.params.id);
    if (!history) return res.status(404).json({ error: "Importação não encontrada." });
    res.json(history);
});

router.get("/export-excel", (req, res) => {
    try {
        const arquivo = excelService.exportar();
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", "attachment; filename=clientes-baileybot.xlsx");
        res.send(arquivo);
    } catch (erro) {
        res.status(500).json({ error: "Não foi possível exportar os clientes." });
    }
});

router.post("/import-excel", async (req, res) => {
    try {
        res.json(await excelService.importar(req.body.base64, req.body.filename, req.body.importedBy || req.body.user));
    } catch (erro) {
        res.status(400).json({ error: erro.message });
    }
});

router.get("/", (req, res) => {

    try {

        const users = req.query.page || req.query.search || req.query.perPage
            ? userService.listarPaginado(req.query)
            : userService.listar();

        res.json(users);

    } catch (erro) {

        console.error(erro);

        res.status(500).json({
            error: erro.message
        });

    }

});

router.post("/", (req, res) => {

    try {

        const resultado = userService.criar(req.body);

        res.json(resultado);

    } catch (erro) {

        console.error(erro);

        res.status(400).json({
            error: erro.message
        });

    }

});

router.put("/:id", (req, res) => {

    try {

        const resultado = userService.atualizar(
            req.params.id,
            req.body
        );

        res.json(resultado);

    } catch (erro) {

        console.error(erro);

        if (erro.message === "Cliente não encontrado.") {

            return res.status(404).json({
                error: erro.message
            });

        }

        res.status(400).json({
            error: erro.message
        });

    }

});

router.delete("/:id", (req, res) => {

    try {

        const resultado = userService.excluir(
            req.params.id
        );

        res.json(resultado);

    } catch (erro) {

        console.error(erro);

        if (erro.message === "Cliente não encontrado.") {

            return res.status(404).json({
                error: erro.message
            });

        }

        res.status(400).json({
            error: erro.message
        });

    }

});

export default router;
