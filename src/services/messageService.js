import db from "../database/database.js";
import whatsappService from "./whatsappService.js";

let ultimoTemplateId = null;

class MessageService {

    listarTemplates() {

        const templates = db.prepare(`
            SELECT *
            FROM message_templates
            WHERE ativo = 1
            ORDER BY id
        `).all();

        return templates;
    }


    buscarTemplateAleatorio() {

        const templates = this.listarTemplates();

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

    async enviarMensagem(cliente) {

        const template = this.buscarTemplateAleatorio();

        if (!template) {
            throw new Error("Nenhum template encontrado.");
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

    listarHistorico() {

        return db.prepare(`
            SELECT
                m.id,
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
            ORDER BY m.enviado_em DESC
        `).all();

    }

}

export default new MessageService();