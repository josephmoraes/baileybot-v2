import express from "express";
import userService from "../../services/userService.js";

const router = express.Router();

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