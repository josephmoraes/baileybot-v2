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

            const cliente = userService.buscarPorId(id);

            if (!cliente) {

                return res.status(404).json({
                    error: "Cliente não encontrado."
                });

            }

            const resultado =
                await messageService.enviarMensagem(cliente);

            res.json(resultado);

        } catch (erro) {

            console.error(erro);

            res.status(500).json({
                error: erro.message
            });

        }

    }

    listarHistorico(req, res) {

        try {

            const historico = messageService.listarHistorico();

            res.json(historico);

        } catch (erro) {

            console.error(erro);

            res.status(500).json({
                code: erro.code,
                message: erro.message
            });

        }

    }

}

export default new MessagesController();