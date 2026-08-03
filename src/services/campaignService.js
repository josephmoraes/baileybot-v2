import db from "../database/database.js";
import whatsappService from "./whatsappService.js";
import messageService from "./messageService.js";
import { sleep } from "../utils/sleep.js";
import settingsService from "./settingsService.js";

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
                COALESCE(SUM(
                    CASE
                        WHEN cr.status = 'enviado' THEN 1
                        ELSE 0
                    END
                ), 0) AS total_enviados,
                COALESCE(SUM(CASE WHEN cr.status = 'erro' THEN 1 ELSE 0 END), 0) AS total_erros
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

    async enviar(campaignId, { somenteErros = false } = {}) {
        const campanha = this.buscarPorId(campaignId);

        if (!campanha) throw new Error("Campanha não encontrada.");
        if (campanha.status === "processando") {
            throw new Error("Esta campanha já está sendo enviada.");
        }
        if (whatsappService.getStatus() !== "connected") {
            throw new Error("Conecte o WhatsApp antes de iniciar a campanha.");
        }
        const config = settingsService.obterBot();
        if (!settingsService.dentroHorario(config)) {
            throw new Error(`Campanhas permitidas somente entre ${config.horarioInicio} e ${config.horarioFim}.`);
        }
        const restanteDiario = config.limiteDiario - settingsService.mensagensEnviadasHoje();
        if (restanteDiario <= 0) throw new Error("O limite diário de mensagens foi atingido.");

        const statusPermitidos = somenteErros
            ? ["erro"]
            : ["pendente", "erro"];
        const placeholders = statusPermitidos.map(() => "?").join(", ");
        const destinatarios = db.prepare(`
            SELECT * FROM campaign_recipients
            WHERE campaign_id = ? AND status IN (${placeholders})
            ORDER BY id
        `).all(campaignId, ...statusPermitidos);

        if (destinatarios.length === 0) {
            throw new Error(somenteErros
                ? "Não há envios com erro para tentar novamente."
                : "Selecione ao menos um destinatário pendente.");
        }

        db.prepare(`UPDATE campaigns SET status = 'processando', updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
            .run(campaignId);

        let enviados = 0;
        let erros = 0;
        let bloqueados = 0;
        const intervaloAleatorio = () => Math.round(
            config.intervaloMinimoMs + Math.random() * (config.intervaloMaximoMs - config.intervaloMinimoMs)
        );

        for (const destinatario of destinatarios) {
            if (enviados >= restanteDiario) break;
            if (settingsService.estaBloqueado(destinatario.cliente_jid)) {
                db.prepare(`UPDATE campaign_recipients SET status='bloqueado',erro='Contato na lista de bloqueio' WHERE id=?`).run(destinatario.id);
                bloqueados += 1;
                continue;
            }
            const cliente = {
                id: destinatario.cliente_id,
                name: destinatario.cliente_nome,
                jid: destinatario.cliente_jid
            };
            const mensagem = messageService.gerarMensagem(
                { mensagem: campanha.template_mensagem },
                cliente
            );

            try {
                await whatsappService.enviarMensagem(cliente.jid, mensagem);
                messageService.salvarHistorico(cliente, campanha.template_id, mensagem, "enviado");
                db.prepare(`
                    UPDATE campaign_recipients
                    SET status = 'enviado', erro = NULL, enviado_em = CURRENT_TIMESTAMP
                    WHERE id = ?
                `).run(destinatario.id);
                enviados += 1;
            } catch (erro) {
                const motivo = erro?.message || "Falha desconhecida no envio.";
                messageService.salvarHistorico(cliente, campanha.template_id, mensagem, "erro");
                db.prepare(`
                    UPDATE campaign_recipients
                    SET status = 'erro', erro = ?, enviado_em = CURRENT_TIMESTAMP
                    WHERE id = ?
                `).run(motivo.slice(0, 500), destinatario.id);
                erros += 1;
            }

            if (destinatario !== destinatarios.at(-1)) await sleep(intervaloAleatorio());
        }

        const pendentes = db.prepare(`
            SELECT COUNT(*) AS total FROM campaign_recipients
            WHERE campaign_id = ? AND status = 'pendente'
        `).get(campaignId).total;
        const statusFinal = erros > 0 || bloqueados > 0 || pendentes > 0 ? "parcial" : "concluida";
        db.prepare(`UPDATE campaigns SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
            .run(statusFinal, campaignId);

        return { success: true, enviados, erros, bloqueados, pendentes, status: statusFinal, notificarConclusao: config.notificarConclusao };
    }
}

export default new CampaignService();
