import db from "../database/database.js";
import settingsService from "./settingsService.js";
import whatsappService from "./whatsappService.js";
import creditMessageTemplateService from "./creditMessageTemplateService.js";

const digits = value => String(value || "").replace(/\D/g, "");
const validPhone = value => {
    const number = digits(value);
    return number.length >= 10 && number.length <= 13;
};

class CommissionNotificationService {
    activeJobs = new Set();

    technicianBalance(id) {
        const technician = db.prepare(`SELECT t.*,
            COALESCE(SUM(c.commission_value),0) total,
            COALESCE(SUM(CASE WHEN c.status='pendente' THEN c.commission_value ELSE 0 END),0) pending,
            COALESCE(SUM(CASE WHEN c.status='liberada' AND NOT EXISTS (
                SELECT 1 FROM credit_request_commissions rc WHERE rc.commission_id=c.id
            ) THEN c.commission_value ELSE 0 END),0) available
            FROM technicians t LEFT JOIN commissions c ON c.technician_id=t.id
            WHERE t.id=? GROUP BY t.id`).get(id);
        if (!technician) throw new Error("Técnico não encontrado.");
        return technician;
    }

    balanceMessage(technician) {
        return creditMessageTemplateService.render("resumo_creditos", {
            nome: technician.name,
            creditoTotal: technician.total,
            creditoDisponivel: technician.available,
            creditoPendente: technician.pending
        });
    }

    creditMessage(item) {
        return creditMessageTemplateService.render("credito_gerado", {
            nome: item.name,
            credito: item.credit_value,
            creditoTotal: item.total,
            creditoDisponivel: item.available,
            creditoPendente: item.pending,
            quantidadeCreditos: item.credit_count
        });
    }

    previewBalance(technicianId) {
        const technician = this.technicianBalance(Number(technicianId));
        return {
            technician: {
                id: technician.id,
                name: technician.name,
                phone: technician.phone,
                total: technician.total,
                available: technician.available,
                pending: technician.pending,
                active: technician.active
            },
            message: this.balanceMessage(technician),
            canSend: Boolean(technician.active && validPhone(technician.phone))
        };
    }

    previewBulk(technicianIds) {
        const ids = [...new Set((technicianIds || []).map(Number).filter(Number.isInteger))];
        const technicians = ids.map(id => this.technicianBalance(id));
        const inactive = technicians.filter(item => !item.active).length;
        const withWhatsapp = technicians.filter(item => item.active && validPhone(item.phone)).length;
        const withoutWhatsapp = technicians.length - withWhatsapp - inactive;
        return {
            selected: technicians.length,
            withWhatsapp,
            withoutWhatsapp,
            inactive,
            willSend: withWhatsapp
        };
    }

    importRecipients(importId) {
        return db.prepare(`SELECT t.id technician_id,t.name,t.phone,
            COUNT(c.id) credit_count,SUM(c.commission_value) credit_value,
            (SELECT COALESCE(SUM(allc.commission_value),0) FROM commissions allc WHERE allc.technician_id=t.id) total,
            (SELECT COALESCE(SUM(allc.commission_value),0) FROM commissions allc
                WHERE allc.technician_id=t.id AND allc.status='liberada' AND NOT EXISTS (
                    SELECT 1 FROM credit_request_commissions rc WHERE rc.commission_id=allc.id
                )) available,
            (SELECT COALESCE(SUM(allc.commission_value),0) FROM commissions allc
                WHERE allc.technician_id=t.id AND allc.status='pendente') pending
            FROM commissions c JOIN technicians t ON t.id=c.technician_id
            WHERE c.import_id=? GROUP BY t.id ORDER BY t.name`).all(importId);
    }

    createImportJob(importId, initiatedBy = "Administrador local", retryOnly = false) {
        const imported = db.prepare("SELECT * FROM commission_imports WHERE id=?").get(importId);
        if (!imported) throw new Error("Importação não encontrada.");
        if (this.activeForImport(importId)) throw new Error("Esta importação já possui um envio em andamento.");
        const candidates = this.importRecipients(importId);
        if (!candidates.length) throw new Error("Esta importação não possui novos créditos para notificar.");
        const create = db.transaction(() => {
            const jobId = Number(db.prepare(`INSERT INTO commission_notification_jobs(import_id,kind,status,initiated_by)
                VALUES(?,'novos_creditos','pendente',?)`).run(importId, initiatedBy).lastInsertRowid);
            const existing = db.prepare(`SELECT * FROM commission_notification_recipients
                WHERE import_id=? AND technician_id=? AND kind='novos_creditos'
                ORDER BY CASE WHEN status='enviado' THEN 0 ELSE 1 END,id DESC LIMIT 1`);
            const insert = db.prepare(`INSERT INTO commission_notification_recipients
                (job_id,import_id,technician_id,technician_name,phone,kind,message,status,error)
                VALUES(?,?,?,?,?,'novos_creditos',?,'pendente',NULL)`);
            let total = 0;
            for (const item of candidates) {
                const previous = existing.get(importId, item.technician_id);
                if (previous?.status === "enviado") continue;
                if (retryOnly && previous?.status !== "falhou") continue;
                const message = this.creditMessage(item);
                if ((!retryOnly && !previous) || (retryOnly && previous?.status === "falhou")) {
                    insert.run(jobId, importId, item.technician_id, item.name, item.phone, message);
                    total += 1;
                }
            }
            if (!total) {
                db.prepare("DELETE FROM commission_notification_jobs WHERE id=?").run(jobId);
                throw new Error(retryOnly ? "Não há notificações com falha para reenviar." : "Todos os novos créditos desta importação já foram notificados.");
            }
            db.prepare("UPDATE commission_notification_jobs SET total=? WHERE id=?").run(total, jobId);
            return jobId;
        });
        const jobId = create();
        this.run(jobId);
        return this.getJob(jobId);
    }

    createBalanceJob(technicianIds, initiatedBy = "Administrador local") {
        const ids = [...new Set((technicianIds || []).map(Number).filter(Number.isInteger))];
        if (!ids.length) throw new Error("Selecione ao menos um técnico.");
        const create = db.transaction(() => {
            const jobId = Number(db.prepare(`INSERT INTO commission_notification_jobs(kind,status,initiated_by)
                VALUES('consulta_saldo','pendente',?)`).run(initiatedBy).lastInsertRowid);
            const insert = db.prepare(`INSERT INTO commission_notification_recipients
                (job_id,technician_id,technician_name,phone,kind,message,status,error)
                VALUES(?,?,?,?, 'consulta_saldo',?,?,?)`);
            for (const id of ids) {
                const technician = this.technicianBalance(id);
                const error = !technician.active ? "Técnico inativo." : !validPhone(technician.phone) ? "WhatsApp não cadastrado ou telefone inválido." : null;
                insert.run(jobId, technician.id, technician.name, technician.phone, this.balanceMessage(technician), error ? "falhou" : "pendente", error);
            }
            db.prepare(`UPDATE commission_notification_jobs SET total=?,processed=?,failed=? WHERE id=?`).run(
                ids.length,
                db.prepare("SELECT COUNT(*) total FROM commission_notification_recipients WHERE job_id=? AND status='falhou'").get(jobId).total,
                db.prepare("SELECT COUNT(*) total FROM commission_notification_recipients WHERE job_id=? AND status='falhou'").get(jobId).total,
                jobId
            );
            return jobId;
        });
        const jobId = create();
        this.run(jobId);
        return this.getJob(jobId);
    }

    activeForImport(importId) {
        return db.prepare(`SELECT id FROM commission_notification_jobs WHERE import_id=? AND status IN ('pendente','processando','cancelando')`).get(importId);
    }

    async cancellableDelay(jobId, duration) {
        const end = Date.now() + duration;
        while (Date.now() < end) {
            const job = db.prepare("SELECT cancel_requested FROM commission_notification_jobs WHERE id=?").get(jobId);
            if (job?.cancel_requested) return false;
            await new Promise(resolve => setTimeout(resolve, Math.min(500, end - Date.now())));
        }
        return true;
    }

    run(jobId) {
        if (this.activeJobs.has(jobId)) return;
        this.activeJobs.add(jobId);
        this.process(jobId).catch(error => {
            console.error("Falha no envio manual de créditos:", error);
            db.prepare(`UPDATE commission_notification_jobs SET status='falhou',finished_at=CURRENT_TIMESTAMP,current_technician=NULL,next_send_at=NULL WHERE id=?`).run(jobId);
        }).finally(() => this.activeJobs.delete(jobId));
    }

    async process(jobId) {
        if (whatsappService.getStatus() !== "connected") {
            db.prepare(`UPDATE commission_notification_recipients SET status='falhou',error='WhatsApp não está conectado.' WHERE job_id=? AND status='pendente'`).run(jobId);
            this.finish(jobId);
            return;
        }
        const config = settingsService.obterBot();
        const recipients = db.prepare("SELECT * FROM commission_notification_recipients WHERE job_id=? AND status='pendente' ORDER BY id").all(jobId);
        db.prepare("UPDATE commission_notification_jobs SET status='processando' WHERE id=?").run(jobId);
        for (let index = 0; index < recipients.length; index += 1) {
            const recipient = recipients[index];
            if (db.prepare("SELECT cancel_requested FROM commission_notification_jobs WHERE id=?").get(jobId)?.cancel_requested) break;
            db.prepare("UPDATE commission_notification_jobs SET current_technician=?,next_send_at=NULL WHERE id=?").run(recipient.technician_name, jobId);
            if (!validPhone(recipient.phone)) {
                this.markRecipient(recipient.id, "falhou", "WhatsApp não cadastrado ou telefone inválido.");
            } else {
                try {
                    await whatsappService.enviarMensagem(recipient.phone, recipient.message);
                    this.markRecipient(recipient.id, "enviado", null);
                } catch (error) {
                    this.markRecipient(recipient.id, "falhou", error?.message || "Falha desconhecida no envio.");
                }
            }
            this.refreshProgress(jobId);
            if (index < recipients.length - 1) {
                const delay = Math.round(config.intervaloMinimoMs + Math.random() * (config.intervaloMaximoMs - config.intervaloMinimoMs));
                db.prepare("UPDATE commission_notification_jobs SET next_send_at=? WHERE id=?").run(new Date(Date.now() + delay).toISOString(), jobId);
                if (!await this.cancellableDelay(jobId, delay)) break;
            }
        }
        this.finish(jobId);
    }

    markRecipient(id, status, error) {
        db.prepare(`UPDATE commission_notification_recipients SET status=?,error=?,sent_at=CASE WHEN ?='enviado' THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id=?`)
            .run(status, error ? String(error).slice(0, 500) : null, status, id);
    }

    refreshProgress(jobId) {
        const totals = db.prepare(`SELECT COUNT(*) processed,
            SUM(CASE WHEN status='enviado' THEN 1 ELSE 0 END) sent,
            SUM(CASE WHEN status='falhou' THEN 1 ELSE 0 END) failed
            FROM commission_notification_recipients WHERE job_id=? AND status<>'pendente'`).get(jobId);
        db.prepare("UPDATE commission_notification_jobs SET processed=?,sent=?,failed=? WHERE id=?")
            .run(totals.processed || 0, totals.sent || 0, totals.failed || 0, jobId);
    }

    finish(jobId) {
        this.refreshProgress(jobId);
        const job = db.prepare("SELECT * FROM commission_notification_jobs WHERE id=?").get(jobId);
        const status = job.cancel_requested ? "cancelado" : job.failed ? (job.sent ? "parcial" : "falhou") : "concluido";
        db.prepare(`UPDATE commission_notification_jobs SET status=?,cancel_requested=0,current_technician=NULL,next_send_at=NULL,finished_at=CURRENT_TIMESTAMP WHERE id=?`).run(status, jobId);
    }

    cancel(jobId) {
        const job = db.prepare("SELECT * FROM commission_notification_jobs WHERE id=?").get(jobId);
        if (!job) throw new Error("Envio não encontrado.");
        if (!["pendente", "processando"].includes(job.status)) throw new Error("Este envio não está em andamento.");
        db.prepare("UPDATE commission_notification_jobs SET status='cancelando',cancel_requested=1 WHERE id=?").run(jobId);
        return { success: true };
    }

    getJob(jobId) {
        const job = db.prepare("SELECT * FROM commission_notification_jobs WHERE id=?").get(jobId);
        if (!job) throw new Error("Envio não encontrado.");
        return { ...job, waiting: Math.max(job.total - job.processed, 0), remaining: Math.max(job.total - job.processed, 0) };
    }

    history() {
        return db.prepare(`SELECT r.*,j.initiated_by,j.created_at started_at
            FROM commission_notification_recipients r JOIN commission_notification_jobs j ON j.id=r.job_id
            ORDER BY r.created_at DESC,r.id DESC LIMIT 300`).all();
    }
}

export default new CommissionNotificationService();
