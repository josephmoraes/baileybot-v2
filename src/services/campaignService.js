import db from "../database/database.js";

class CampaignService {

    listar() {
        return db.prepare(`
            SELECT
                c.id,
                c.nome,
                c.template_id,
                c.status,
                c.created_at,
                c.updated_at,
                t.nome AS template_nome,
                COUNT(cr.id) AS total_destinatarios,
                SUM(
                    CASE
                        WHEN cr.status = 'enviado' THEN 1
                        ELSE 0
                    END
                ) AS total_enviados
            FROM campaigns c
            INNER JOIN message_templates t
                ON t.id = c.template_id
            LEFT JOIN campaign_recipients cr
                ON cr.campaign_id = c.id
            GROUP BY c.id
            ORDER BY c.created_at DESC
        `).all();
    }

    buscarPorId(id) {
        return db.prepare(`
            SELECT
                c.*,
                t.nome AS template_nome,
                t.mensagem AS template_mensagem
            FROM campaigns c
            INNER JOIN message_templates t
                ON t.id = c.template_id
            WHERE c.id = ?
        `).get(id);
    }

    criar({ nome, templateId }) {
        this.validar(nome, templateId);
        this.validarTemplate(templateId);

        const resultado = db.prepare(`
            INSERT INTO campaigns (
                nome,
                template_id
            )
            VALUES (?, ?)
        `).run(
            nome.trim(),
            templateId
        );

        return this.buscarPorId(resultado.lastInsertRowid);
    }

    atualizar(id, { nome, templateId }) {
        this.validar(nome, templateId);
        this.validarTemplate(templateId);

        const campanha = this.buscarPorId(id);

        if (!campanha) {
            throw new Error("Campanha não encontrada.");
        }

        if (campanha.status !== "rascunho") {
            throw new Error(
                "Somente campanhas em rascunho podem ser editadas."
            );
        }

        db.prepare(`
            UPDATE campaigns
            SET
                nome = ?,
                template_id = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(
            nome.trim(),
            templateId,
            id
        );

        return this.buscarPorId(id);
    }

    excluir(id) {
        const campanha = this.buscarPorId(id);

        if (!campanha) {
            throw new Error("Campanha não encontrada.");
        }

        if (campanha.status !== "rascunho") {
            throw new Error(
                "Somente campanhas em rascunho podem ser excluídas."
            );
        }

        db.prepare(`
            DELETE FROM campaigns
            WHERE id = ?
        `).run(id);

        return {
            success: true
        };
    }

    validar(nome, templateId) {
        if (!nome?.trim()) {
            throw new Error("O nome da campanha é obrigatório.");
        }

        if (!templateId) {
            throw new Error("Selecione um template.");
        }
    }

    validarTemplate(templateId) {
        const template = db.prepare(`
            SELECT id
            FROM message_templates
            WHERE id = ?
            AND ativo = 1
        `).get(templateId);

        if (!template) {
            throw new Error("Template ativo não encontrado.");
        }
    }

    listarDestinatarios(campaignId) {
    const campanha = this.buscarPorId(campaignId);

    if (!campanha) {
        throw new Error("Campanha não encontrada.");
    }

    return db.prepare(`
        SELECT
            cr.id,
            cr.campaign_id,
            cr.cliente_id,
            cr.cliente_nome,
            cr.cliente_jid,
            cr.status,
            cr.erro,
            cr.enviado_em
        FROM campaign_recipients cr
        WHERE cr.campaign_id = ?
        ORDER BY cr.cliente_nome
    `).all(campaignId);
}

    salvarDestinatarios(campaignId, clienteIds) {
        const campanha = this.buscarPorId(campaignId);

        if (!campanha) {
            throw new Error("Campanha não encontrada.");
        }

        if (campanha.status !== "rascunho") {
            throw new Error(
                "Os destinatários só podem ser alterados enquanto a campanha estiver em rascunho."
            );
        }

        if (!Array.isArray(clienteIds)) {
            throw new Error(
                "A lista de clientes é inválida."
            );
        }

        const idsUnicos = [
            ...new Set(
                clienteIds
                    .map(Number)
                    .filter(Number.isInteger)
            )
        ];

        const salvar = db.transaction(() => {
            db.prepare(`
                DELETE FROM campaign_recipients
                WHERE campaign_id = ?
            `).run(campaignId);

            if (idsUnicos.length === 0) {
                return;
            }

            const placeholders = idsUnicos
                .map(() => "?")
                .join(", ");

            const clientes = db.prepare(`
                SELECT
                    id,
                    name,
                    company_name,
                    jid
                FROM users
                WHERE id IN (${placeholders})
            `).all(...idsUnicos);

            if (clientes.length !== idsUnicos.length) {
                throw new Error(
                    "Um ou mais clientes não foram encontrados."
                );
            }

            const inserir = db.prepare(`
                INSERT INTO campaign_recipients (
                    campaign_id,
                    cliente_id,
                    cliente_nome,
                    cliente_jid
                )
                VALUES (?, ?, ?, ?)
            `);

            clientes.forEach(cliente => {
                inserir.run(
                    campaignId,
                    cliente.id,
                    cliente.name ||
                        cliente.company_name ||
                        "Cliente",
                    cliente.jid
                );
            });

            db.prepare(`
                UPDATE campaigns
                SET updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(campaignId);
        });

        salvar();

        return this.listarDestinatarios(campaignId);
    }
}

export default new CampaignService();