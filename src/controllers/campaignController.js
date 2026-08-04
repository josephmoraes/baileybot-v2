import campaignService from "../services/campaignService.js";

class CampaignController {

    listar(req, res) {
        try {
            const campanhas = campaignService.listar();

            res.json(campanhas);
        } catch (erro) {
            console.error(erro);

            res.status(500).json({
                error: "Erro ao listar campanhas."
            });
        }
    }

    buscarPorId(req, res) {
        try {
            const campanha = campaignService.buscarPorId(
                req.params.id
            );

            if (!campanha) {
                return res.status(404).json({
                    error: "Campanha não encontrada."
                });
            }

            res.json(campanha);
        } catch (erro) {
            console.error(erro);

            res.status(500).json({
                error: "Erro ao buscar campanha."
            });
        }
    }

    criar(req, res) {
        try {
            const campanha = campaignService.criar({
                nome: req.body.nome,
                templateId: req.body.templateId
            });

            res.status(201).json(campanha);
        } catch (erro) {
            console.error(erro);

            res.status(400).json({
                error: erro.message
            });
        }
    }

    atualizar(req, res) {
        try {
            const campanha = campaignService.atualizar(
                req.params.id,
                {
                    nome: req.body.nome,
                    templateId: req.body.templateId
                }
            );

            res.json(campanha);
        } catch (erro) {
            console.error(erro);

            const status = erro.message === "Campanha não encontrada."
                ? 404
                : 400;

            res.status(status).json({
                error: erro.message
            });
        }
    }

    excluir(req, res) {
        try {
            const resultado = campaignService.excluir(
                req.params.id
            );

            res.json(resultado);
        } catch (erro) {
            console.error(erro);

            const status = erro.message === "Campanha não encontrada."
                ? 404
                : 400;

            res.status(status).json({
                error: erro.message
            });
        }
    }

    listarDestinatarios(req, res) {
        try {
            const destinatarios =
                campaignService.listarDestinatarios(
                    req.params.id
                );

            res.json(destinatarios);
        } catch (erro) {
            console.error(erro);

            const status =
                erro.message === "Campanha não encontrada."
                    ? 404
                    : 400;

            res.status(status).json({
                error: erro.message
            });
        }
    }

    salvarDestinatarios(req, res) {
        try {
            const destinatarios =
                campaignService.salvarDestinatarios(
                    req.params.id,
                    req.body.clienteIds
                );

            res.json({
                message: "Destinatários salvos com sucesso.",
                total: destinatarios.length,
                destinatarios
            });
        } catch (erro) {
            console.error(erro);

            const status =
                erro.message === "Campanha não encontrada."
                    ? 404
                    : 400;

            res.status(status).json({
                error: erro.message
            });
        }
    }

    async validarDestinatarios(req, res) {
        try {
            const resultado = await campaignService.validarDestinatarios(
                req.params.id
            );

            res.json(resultado);
        } catch (erro) {
            console.error(erro);

            const status = erro.message === "Campanha não encontrada."
                ? 404
                : 400;

            res.status(status).json({
                error: erro.message
            });
        }
    }

    async enviar(req, res) {
        try {
            const resultado = await campaignService.enviar(req.params.id, {
                somenteErros: req.body?.somenteErros === true
            });
            res.json(resultado);
        } catch (erro) {
            console.error(erro);
            const status = erro.message === "Campanha não encontrada." ? 404 : 400;
            res.status(status).json({ error: erro.message });
        }
    }

    cancelar(req, res) {
        try {
            const resultado = campaignService.cancelar(req.params.id);
            res.json(resultado);
        } catch (erro) {
            console.error(erro);
            const status = erro.message === "Campanha não encontrada." ? 404 : 400;
            res.status(status).json({ error: erro.message });
        }
    }

}

export default new CampaignController();
