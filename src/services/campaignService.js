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
                c.validation_status,
                c.validated_at,
                c.progress_total,
                c.progress_processed,
                c.current_recipient,
                c.next_send_at,
                c.cooldown_ms,
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
                COALESCE(SUM(CASE WHEN cr.status = 'erro' THEN 1 ELSE 0 END), 0) AS total_erros,
                COALESCE(SUM(CASE WHEN cr.validation_status = 'valido' THEN 1 ELSE 0 END), 0) AS total_validos,
                COALESCE(SUM(CASE WHEN cr.validation_status NOT IN ('valido', 'nao_validado') THEN 1 ELSE 0 END), 0) AS total_invalidos
            FROM campaigns c
            INNER JOIN message_templates t
                ON t.id = c.template_id
            LEFT JOIN campaign_recipients cr
                ON cr.campaign_id = c.id AND cr.active = 1
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

        if (["processando", "cancelando"].includes(campanha.status)) {
            throw new Error(
                "A campanha não pode ser editada enquanto está em processamento."
            );
        }

        db.prepare(`
            UPDATE campaigns
            SET
                nome = ?,
                template_id = ?,
                status = 'rascunho',
                validation_status = 'nao_validada',
                validated_at = NULL,
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

        if (["processando", "cancelando"].includes(campanha.status)) {
            throw new Error(
                "A campanha não pode ser excluída enquanto está em processamento."
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
            cr.enviado_em,
            cr.validation_status,
            cr.validation_error,
            cr.validated_jid,
            cr.validated_at
        FROM campaign_recipients cr
        WHERE cr.campaign_id = ? AND cr.active = 1
        ORDER BY cr.cliente_nome
    `).all(campaignId);
}

    salvarDestinatarios(campaignId, clienteIds) {
        const campanha = this.buscarPorId(campaignId);

        if (!campanha) {
            throw new Error("Campanha não encontrada.");
        }

        if (["processando", "cancelando"].includes(campanha.status)) {
            throw new Error(
                "Os destinatários não podem ser alterados durante ou após a conclusão do envio."
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
            const existentes = db.prepare(`
                SELECT id, cliente_id, status, active
                FROM campaign_recipients
                WHERE campaign_id = ?
            `).all(campaignId);

            const selecionados = new Set(idsUnicos);
            const idsRemover = existentes
                .filter(item => item.active && !selecionados.has(item.cliente_id))
                .map(item => item.id);

            if (idsRemover.length > 0) {
                const marcadores = idsRemover.map(() => "?").join(", ");
                db.prepare(`
                    UPDATE campaign_recipients
                    SET active = 0
                    WHERE id IN (${marcadores})
                `).run(...idsRemover);
            }

            const idsExistentes = new Set(
                existentes
                    .filter(item => item.cliente_id !== null)
                    .map(item => item.cliente_id)
            );

            const idsReativar = existentes
                .filter(item => selecionados.has(item.cliente_id))
                .map(item => item.id);

            if (idsReativar.length > 0) {
                const marcadores = idsReativar.map(() => "?").join(", ");
                db.prepare(`UPDATE campaign_recipients SET active = 1 WHERE id IN (${marcadores})`)
                    .run(...idsReativar);
            }

            const idsReiniciar = existentes
                .filter(item => item.status !== "enviado" && selecionados.has(item.cliente_id))
                .map(item => item.id);

            if (idsReiniciar.length > 0) {
                const marcadores = idsReiniciar.map(() => "?").join(", ");
                db.prepare(`
                    UPDATE campaign_recipients
                    SET
                        status = 'pendente',
                        erro = NULL,
                        enviado_em = NULL,
                        validation_status = 'nao_validado',
                        validation_error = NULL,
                        validated_jid = NULL,
                        validated_at = NULL
                    WHERE id IN (${marcadores})
                `).run(...idsReiniciar);
            }

            db.prepare(`
                UPDATE campaigns
                SET
                    validation_status = 'nao_validada',
                    validated_at = NULL,
                    status = 'rascunho',
                    cancel_requested = 0,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(campaignId);

            if (idsUnicos.length === 0) {
                return;
            }

            const idsNovos = idsUnicos.filter(id => !idsExistentes.has(id));

            if (idsNovos.length === 0) {
                return;
            }

            const placeholders = idsNovos
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
            `).all(...idsNovos);

            if (clientes.length !== idsNovos.length) {
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

        });

        salvar();

        return this.listarDestinatarios(campaignId);
    }

    async validarDestinatarios(campaignId) {
        const campanha = this.buscarPorId(campaignId);

        if (!campanha) {
            throw new Error("Campanha não encontrada.");
        }

        if (["processando", "cancelando"].includes(campanha.status)) {
            throw new Error("Esta campanha não pode ser validada no estado atual.");
        }

        if (whatsappService.getStatus() !== "connected") {
            throw new Error("Conecte o WhatsApp antes de validar os contatos.");
        }

        const destinatarios = this.listarDestinatarios(campaignId);

        if (destinatarios.length === 0) {
            throw new Error("Selecione ao menos um destinatário.");
        }

        db.prepare(`
            UPDATE campaigns
            SET validation_status = 'validando', validated_at = NULL
            WHERE id = ?
        `).run(campaignId);

        const atualizar = db.prepare(`
            UPDATE campaign_recipients
            SET
                validation_status = ?,
                validation_error = ?,
                validated_jid = ?,
                validated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `);

        for (const destinatario of destinatarios) {
            let status = "erro_validacao";
            let erro = null;
            let jidValidado = null;

            try {
                if (destinatario.status === "enviado") {
                    atualizar.run("ja_enviado", "Mensagem já enviada nesta campanha.", destinatario.validated_jid, destinatario.id);
                    continue;
                }

                const numero = String(destinatario.cliente_jid || "")
                    .replace("@s.whatsapp.net", "")
                    .replace(/\D/g, "");

                if (numero.length < 10 || numero.length > 13) {
                    status = "telefone_invalido";
                    erro = "Telefone com quantidade de dígitos inválida.";
                } else if (settingsService.estaBloqueado(destinatario.cliente_jid)) {
                    status = "bloqueado";
                    erro = "Contato na lista de bloqueio.";
                } else {
                    const resultado = await whatsappService.verificarNumero(numero);

                    if (resultado.exists) {
                        status = "valido";
                        jidValidado = resultado.jid;
                    } else {
                        status = "sem_whatsapp";
                        erro = "Número não encontrado no WhatsApp.";
                    }
                }
            } catch (falha) {
                status = "erro_validacao";
                erro = falha?.message || "Não foi possível validar o contato.";
            }

            atualizar.run(status, erro, jidValidado, destinatario.id);
        }

        db.prepare(`
            UPDATE campaigns
            SET
                validation_status = 'validada',
                validated_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(campaignId);

        const resultados = this.listarDestinatarios(campaignId);
        const resumo = resultados.reduce((totais, item) => {
            totais.selecionados += 1;
            if (item.validation_status === "valido") totais.validos += 1;
            if (item.validation_status === "sem_whatsapp") totais.semWhatsapp += 1;
            if (item.validation_status === "telefone_invalido") totais.telefoneInvalido += 1;
            if (item.validation_status === "bloqueado") totais.bloqueados += 1;
            if (item.validation_status === "erro_validacao") totais.erros += 1;
            if (item.validation_status === "ja_enviado") totais.jaEnviados += 1;
            return totais;
        }, {
            selecionados: 0,
            validos: 0,
            semWhatsapp: 0,
            telefoneInvalido: 0,
            bloqueados: 0,
            erros: 0,
            jaEnviados: 0
        });

        return {
            campanha: this.buscarPorId(campaignId),
            resumo,
            destinatarios: resultados
        };
    }

    async enviar(campaignId, { somenteErros = false } = {}) {
        const campanha = this.buscarPorId(campaignId);

        if (!campanha) throw new Error("Campanha não encontrada.");
        if (["processando", "cancelando"].includes(campanha.status)) {
            throw new Error("Esta campanha já está sendo enviada.");
        }
        if (!somenteErros && campanha.validation_status !== "validada") {
            throw new Error("Valide os contatos antes de iniciar a campanha.");
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
            WHERE campaign_id = ?
              AND active = 1
              AND status IN (${placeholders})
              AND validation_status = 'valido'
            ORDER BY id
        `).all(campaignId, ...statusPermitidos);

        if (destinatarios.length === 0) {
            throw new Error(somenteErros
                ? "Não há envios com erro para tentar novamente."
                : "Selecione ao menos um destinatário pendente.");
        }

        db.prepare(`
            UPDATE campaigns
            SET status = 'processando', cancel_requested = 0,
                progress_total = ?, progress_processed = 0,
                current_recipient = NULL, next_send_at = NULL, cooldown_ms = 0,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(destinatarios.length, campaignId);

        let enviados = 0;
        let erros = 0;
        let bloqueados = 0;
        let cancelada = false;
        const intervaloAleatorio = () => Math.round(
            config.intervaloMinimoMs + Math.random() * (config.intervaloMaximoMs - config.intervaloMinimoMs)
        );

        for (let indice = 0; indice < destinatarios.length; indice += 1) {
            const destinatario = destinatarios[indice];
            const cancelamento = db.prepare(`
                SELECT cancel_requested FROM campaigns WHERE id = ?
            `).get(campaignId);

            if (cancelamento?.cancel_requested) {
                cancelada = true;
                break;
            }

            if (enviados >= restanteDiario) break;
            db.prepare(`UPDATE campaigns SET current_recipient = ?, next_send_at = NULL WHERE id = ?`)
                .run(destinatario.cliente_nome, campaignId);
            if (settingsService.estaBloqueado(destinatario.cliente_jid)) {
                db.prepare(`UPDATE campaign_recipients SET status='bloqueado',erro='Contato na lista de bloqueio' WHERE id=?`).run(destinatario.id);
                bloqueados += 1;
                db.prepare(`UPDATE campaigns SET progress_processed = ? WHERE id = ?`)
                    .run(indice + 1, campaignId);
                continue;
            }
            const cliente = {
                id: destinatario.cliente_id,
                name: destinatario.cliente_nome,
                jid: destinatario.validated_jid || destinatario.cliente_jid
            };
            const mensagem = messageService.gerarMensagem(
                { mensagem: campanha.template_mensagem },
                cliente
            );

            try {
                await whatsappService.enviarMensagem(cliente.jid, mensagem);
                messageService.salvarHistorico(cliente, campanha.template_id, mensagem, "enviado", campanha);
                db.prepare(`
                    UPDATE campaign_recipients
                    SET status = 'enviado', erro = NULL, enviado_em = CURRENT_TIMESTAMP
                    WHERE id = ?
                `).run(destinatario.id);
                enviados += 1;
            } catch (erro) {
                const motivo = erro?.message || "Falha desconhecida no envio.";
                messageService.salvarHistorico(cliente, campanha.template_id, mensagem, "erro", campanha);
                db.prepare(`
                    UPDATE campaign_recipients
                    SET status = 'erro', erro = ?, enviado_em = CURRENT_TIMESTAMP
                    WHERE id = ?
                `).run(motivo.slice(0, 500), destinatario.id);
                erros += 1;
            }

            db.prepare(`UPDATE campaigns SET progress_processed = ? WHERE id = ?`)
                .run(indice + 1, campaignId);

            if (indice < destinatarios.length - 1) {
                const intervalo = intervaloAleatorio();
                const proximoEnvio = new Date(Date.now() + intervalo).toISOString();
                db.prepare(`UPDATE campaigns SET next_send_at = ?, cooldown_ms = ?, current_recipient = ? WHERE id = ?`)
                    .run(proximoEnvio, intervalo, destinatarios[indice + 1].cliente_nome, campaignId);
                await sleep(intervalo);
            }
        }

        const pendentes = db.prepare(`
            SELECT COUNT(*) AS total FROM campaign_recipients
            WHERE campaign_id = ?
              AND status = 'pendente'
              AND active = 1
              AND validation_status = 'valido'
        `).get(campaignId).total;
        const statusFinal = cancelada
            ? "cancelada"
            : erros > 0 || bloqueados > 0 || pendentes > 0
                ? "parcial"
                : "concluida";
        db.prepare(`UPDATE campaigns SET status = ?, cancel_requested = 0, current_recipient = NULL, next_send_at = NULL, cooldown_ms = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
            .run(statusFinal, campaignId);

        return { success: true, enviados, erros, bloqueados, pendentes, cancelada, status: statusFinal, notificarConclusao: config.notificarConclusao };
    }

    cancelar(campaignId) {
        const campanha = this.buscarPorId(campaignId);

        if (!campanha) {
            throw new Error("Campanha não encontrada.");
        }

        if (campanha.status !== "processando") {
            throw new Error("Somente campanhas em processamento podem ser canceladas.");
        }

        db.prepare(`
            UPDATE campaigns
            SET status = 'cancelando', cancel_requested = 1, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(campaignId);

        return {
            success: true,
            message: "Cancelamento solicitado. O envio atual será concluído e os próximos serão interrompidos."
        };
    }
}

export default new CampaignService();
