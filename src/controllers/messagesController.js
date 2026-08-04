import messageService from "../services/messageService.js";
import userService from "../services/userService.js";



class MessagesController {

    listarTemplates(req, res) {

        try {

            const templates = messageService.listarTemplates();

            res.json(templates);

        } catch (error) {

            console.error(error);

            res.status(500).json({
                erro: "Erro ao listar templates."
            });

        }

    }

    async enviarMensagem(req, res) {

        try {

            const { id } = req.params;
            const { templateId } = req.body;

            const cliente = userService.buscarPorId(id);

            if (!cliente) {

                return res.status(404).json({
                    error: "Cliente não encontrado."
                });

            }

            if (!templateId) {
                return res.status(400).json({
                    error: "Selecione um template."
                });
            }

            const resultado =
                await messageService.enviarMensagem(cliente, templateId);

            res.json(resultado);

        } catch (erro) {

            console.error(erro);

            const status = erro.message === "Template ativo não encontrado." ? 400 : 500;
            res.status(status).json({
                error: erro.message
            });

        }

    }

    listarHistorico(req, res) {

        try {

            const { clienteId, status, dataInicio, dataFim, pesquisa, pagina, porPagina } = req.query;

            const resultado = messageService.listarHistorico({
                clienteId,
                status,
                dataInicio,
                dataFim,
                pesquisa,
                pagina,
                porPagina
            });

            res.json(resultado);

        } catch (erro) {

            console.error(erro);

            res.status(500).json({
                code: erro.code,
                message: erro.message
            });

        }

    }

    limparHistorico(req, res) {
        try {
            res.json(messageService.limparHistorico());
        } catch (erro) {
            console.error(erro);
            res.status(500).json({ error: "Não foi possível limpar o histórico." });
        }
    }

    criarTemplate(req, res) {

        try {

            const { nome, mensagem, ativo } = req.body;

            if (!nome?.trim() || !mensagem?.trim()) {
                return res.status(400).json({
                    error: "Nome e mensagem são obrigatórios."
                });
            }

            const id = messageService.criarTemplate(
                nome,
                mensagem,
                ativo
            );

            res.status(201).json({
                message: "Template criado com sucesso.",
                id
            });

        } catch (erro) {

            console.error(erro);

            res.status(500).json({
                error: erro.message
            });

        }

    }

    editarTemplate(req, res) {

        try {

            const { id } = req.params;
            const { nome, mensagem, ativo } = req.body;

            if (!nome?.trim() || !mensagem?.trim()) {
                return res.status(400).json({
                    error: "Nome e mensagem são obrigatórios."
                });
            }

            const atualizado = messageService.editarTemplate(
                id,
                nome,
                mensagem,
                ativo
            );

            if (!atualizado) {
                return res.status(404).json({
                    error: "Template não encontrado."
                });
            }

            res.json({
                message: "Template atualizado com sucesso."
            });

        } catch (erro) {

            console.error(erro);

            res.status(500).json({
                error: erro.message
            });

        }

    }

    excluirTemplate(req, res) {

        try {

            const { id } = req.params;

            const excluido = messageService.excluirTemplate(id);

            if (!excluido) {
                return res.status(404).json({
                    error: "Template não encontrado."
                });
            }

            res.json({
                message: "Template excluído com sucesso."
            });

        } catch (erro) {

            console.error(erro);

            const status = erro.message.includes("vinculado a uma campanha") ? 409 : 500;
            res.status(status).json({
                error: erro.message
            });

        }

    }

}

export default new MessagesController();
