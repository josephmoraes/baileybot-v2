import db from "../database/database.js";
import whatsappService from "./whatsappService.js";
import settingsService from "./settingsService.js";

let ultimoTemplateId = null;

class MessageService {

    listarTemplates() {

        const templates = db.prepare(`
            SELECT *
            FROM message_templates
            ORDER BY id
        `).all();

        return templates;
    }

    criarTemplate(nome, mensagem, ativo = 1) {

        const resultado = db.prepare(`
            INSERT INTO message_templates (
                nome,
                mensagem,
                ativo
            )
            VALUES (?, ?, ?)
        `).run(
            nome.trim(),
            mensagem.trim(),
            ativo ? 1 : 0
        );

        return resultado.lastInsertRowid;

    }

    editarTemplate(id, nome, mensagem, ativo) {

        const resultado = db.prepare(`
            UPDATE message_templates
            SET
                nome = ?,
                mensagem = ?,
                ativo = ?
            WHERE id = ?
        `).run(
            nome.trim(),
            mensagem.trim(),
            ativo ? 1 : 0,
            id
        );

        return resultado.changes > 0;

    }

    excluirTemplate(id) {

        const emUso = db.prepare(`
            SELECT COUNT(*) AS total FROM campaigns WHERE template_id = ?
        `).get(id).total;
        if (emUso) {
            throw new Error("Este template está vinculado a uma campanha e não pode ser excluído.");
        }

        const resultado = db.prepare(`
            DELETE FROM message_templates
            WHERE id = ?
        `).run(id);

        return resultado.changes > 0;

    }


    buscarTemplateAleatorio() {

        const templates = this.listarTemplates().filter(template => template.ativo);

        if (templates.length === 0) {
            return null;
        }

        if (templates.length === 1) {
            ultimoTemplateId = templates[0].id;
            return templates[0];
        }

        let template;

        do {

            const indice = Math.floor(
                Math.random() * templates.length
            );

            template = templates[indice];

        } while (template.id === ultimoTemplateId);

        ultimoTemplateId = template.id;

        return template;

    }

    gerarMensagem(template, cliente) {

        if (!template) {
            return null;
        }

        let mensagem = template.mensagem;

        mensagem = mensagem.replaceAll(
            "{nome}",
            cliente.name || "Cliente"
        );

        mensagem = mensagem.replaceAll(
            "{vendedor}",
            settingsService.obterBot().nomeVendedor
        );

        return mensagem;
    }

    gerarMensagemPorCliente(cliente) {

        const template = this.buscarTemplateAleatorio();

        if (!template) {
            return null;
        }

        return {
            template,
            mensagem: this.gerarMensagem(template, cliente)
        };

    }

    salvarHistorico(cliente, templateId, mensagem, status) {

        db.prepare(`
            INSERT INTO messages (
                cliente_id,
                cliente_nome,
                template_id,
                mensagem,
                status,
                enviado_em
            )
            VALUES (?, ?, ?, ?, ?, datetime('now'))
        `).run(
            cliente.id,
            cliente.name,
            templateId,
            mensagem,
            status
        );

    }

    async enviarMensagem(cliente, templateId) {

        const config = settingsService.obterBot();
        if (!settingsService.dentroHorario(config)) {
            throw new Error(`Envios permitidos somente entre ${config.horarioInicio} e ${config.horarioFim}.`);
        }
        if (settingsService.mensagensEnviadasHoje() >= config.limiteDiario) {
            throw new Error("O limite diário de mensagens foi atingido.");
        }
        if (settingsService.estaBloqueado(cliente.jid)) {
            throw new Error("Este contato está na lista de bloqueio.");
        }

        const template = db.prepare(`
            SELECT *
            FROM message_templates
            WHERE id = ? AND ativo = 1
        `).get(templateId);

        if (!template) {
            throw new Error("Template ativo não encontrado.");
        }

        const mensagem = this.gerarMensagem(template, cliente);

        try {

            await whatsappService.enviarMensagem(
                cliente.jid,
                mensagem
            );

            this.salvarHistorico(
                cliente,
                template.id,
                mensagem,
                "enviado"
            );

            return {
                sucesso: true,
                template: template.nome,
                mensagem
            };

        } catch (erro) {

            this.salvarHistorico(
                cliente,
                template.id,
                mensagem,
                "erro"
            );

            throw erro;

        }

    }

    listarHistorico(filtros = {}) {

        const {
            clienteId,
            status,
            dataInicio,
            dataFim,
            pesquisa
        } = filtros;

        const condicoes = [];
        const parametros = [];

        if (clienteId) {
            condicoes.push("m.cliente_id = ?");
            parametros.push(clienteId);
        }

        if (status) {
            condicoes.push("m.status = ?");
            parametros.push(status);
        }

        if (dataInicio) {
            condicoes.push("date(m.enviado_em) >= date(?)");
            parametros.push(dataInicio);
        }

        if (dataFim) {
            condicoes.push("date(m.enviado_em) <= date(?)");
            parametros.push(dataFim);
        }

        if (pesquisa?.trim()) {
            condicoes.push("(COALESCE(u.name, m.cliente_nome) LIKE ? OR COALESCE(t.nome, '') LIKE ?)");
            const termo = `%${pesquisa.trim()}%`;
            parametros.push(termo, termo);
        }

        const whereClause = condicoes.length
            ? `WHERE ${condicoes.join(" AND ")}`
            : "";

        const pagina = Math.max(1, Number.parseInt(filtros.pagina, 10) || 1);
        const porPagina = Math.min(100, Math.max(5, Number.parseInt(filtros.porPagina, 10) || 20));
        const total = db.prepare(`
            SELECT COUNT(*) AS total
            FROM messages m
            LEFT JOIN users u ON u.id = m.cliente_id
            LEFT JOIN message_templates t ON t.id = m.template_id
            ${whereClause}
        `).get(...parametros).total;

        const itens = db.prepare(`
            SELECT
                m.id,
                m.cliente_id,
                COALESCE(u.name, m.cliente_nome) AS cliente,
                t.nome AS template,
                m.mensagem,
                m.status,
                m.enviado_em
            FROM messages m
            LEFT JOIN users u
                ON u.id = m.cliente_id
            LEFT JOIN message_templates t
                ON t.id = m.template_id
            ${whereClause}
            ORDER BY m.enviado_em DESC
            LIMIT ? OFFSET ?
        `).all(...parametros, porPagina, (pagina - 1) * porPagina);

        return {
            itens,
            paginacao: {
                pagina,
                porPagina,
                total,
                totalPaginas: Math.max(1, Math.ceil(total / porPagina))
            }
        };

    }

}

export default new MessageService();
