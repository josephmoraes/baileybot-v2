import campaignService from "../services/campaignService.js";

const mensagemErroCampanha = erro => {
    const mensagem = String(erro?.message || "");
    if (mensagem.includes("campaign_recipients.cliente_jid")) return "Este cliente está sem telefone/WhatsApp. Ele pode participar da campanha, mas precisa de um número para receber mensagens pelo bot.";
    if (mensagem.includes("UNIQUE constraint failed: campaign_recipients")) return "Este cliente já participa desta campanha.";
    if (mensagem.includes("FOREIGN KEY constraint failed")) return "A campanha ou o cliente relacionado não foi encontrado. Atualize a página e tente novamente.";
    if (mensagem.includes("SQLITE_BUSY") || mensagem.includes("database is locked")) return "O banco de dados está ocupado. Aguarde alguns segundos e tente novamente.";
    if (mensagem.includes("SQLITE_READONLY") || mensagem.includes("readonly database")) return "O BaileyBot não conseguiu gravar no banco. Verifique se o arquivo está bloqueado pelo OneDrive.";
    if (mensagem.includes("constraint failed") || mensagem.startsWith("SQLITE_")) return "Não foi possível salvar por uma restrição dos dados. Atualize a página e confira as informações do cliente.";
    return mensagem || "Não foi possível concluir a operação.";
};

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
                templateId: req.body.templateId,
                messageMode: req.body.messageMode,
                customMessage: req.body.customMessage
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
                    templateId: req.body.templateId,
                    messageMode: req.body.messageMode,
                    customMessage: req.body.customMessage
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

    adicionarDestinatarios(req, res) {
        try {
            const destinatarios = campaignService.adicionarDestinatarios(req.params.id, req.body.clienteIds);
            res.json({ message: "Clientes adicionados à campanha.", total: destinatarios.length, destinatarios });
        } catch (erro) {
            const status = erro.message === "Campanha não encontrada." ? 404 : 400;
            res.status(status).json({ error: mensagemErroCampanha(erro) });
        }
    }

    atualizarAcompanhamento(req, res) {
        try {
            res.json(campaignService.atualizarAcompanhamento(req.params.id, req.params.recipientId, req.body));
        } catch (erro) {
            const status = erro.message.includes("não encontrad") ? 404 : 400;
            res.status(status).json({ error: erro.message });
        }
    }

    atualizarFiltrosReativacao(req, res) {
        try {
            const resultado = campaignService.atualizarFiltrosReativacao(req.params.id, req.body || {});
            res.json({ ...resultado, total: resultado.recipients.length });
        } catch (erro) {
            const status = erro.message === "Campanha não encontrada." ? 404 : 400;
            res.status(status).json({ error: erro.message });
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
                error: mensagemErroCampanha(erro)
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
