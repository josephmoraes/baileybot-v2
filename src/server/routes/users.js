import express from "express";
import userService from "../../services/userService.js";
import excelService from "../../services/excel.js";

const router = express.Router();

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

router.post("/import-excel", (req, res) => {
    try {
        res.json(excelService.importar(req.body.base64));
    } catch (erro) {
        res.status(400).json({ error: erro.message });
    }
});

router.get("/", (req, res) => {

    try {

        const users = userService.listar();

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
