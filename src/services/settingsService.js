import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import db from "../database/database.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const databaseDir = path.resolve(__dirname, "../../database");

class SettingsService {
    obterValor(chave, padrao = "") {
        return db.prepare("SELECT value FROM app_settings WHERE key = ?").get(chave)?.value ?? padrao;
    }

    obterBot() {
        return {
            intervaloCampanhaMs: Number(this.obterValor("campaign_delay_ms", "1500")),
            nomeVendedor: this.obterValor("seller_name", "Noberto"),
            intervaloMinimoMs: Number(this.obterValor("campaign_delay_min_ms", "8000")),
            intervaloMaximoMs: Number(this.obterValor("campaign_delay_max_ms", "15000")),
            horarioInicio: this.obterValor("sending_start_time", "08:00"),
            horarioFim: this.obterValor("sending_end_time", "18:00"),
            limiteDiario: Number(this.obterValor("daily_message_limit", "200")),
            notificarConclusao: this.obterValor("notify_campaign_complete", "1") === "1"
        };
    }

    salvarBot(dados) {
        const minimo = Number(dados.intervaloMinimoSegundos);
        const maximo = Number(dados.intervaloMaximoSegundos);
        const limite = Number(dados.limiteDiario);
        const horarioValido = valor => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(valor));
        const segundos = Number(dados.intervaloCampanhaSegundos ?? minimo);
        const vendedor = String(dados.nomeVendedor ?? "").trim();
        if (![minimo, maximo].every(v => Number.isFinite(v) && v >= 1 && v <= 300) || minimo > maximo) {
            throw new Error("Informe intervalos entre 1 e 300 segundos; o mínimo não pode superar o máximo.");
        }
        if (!horarioValido(dados.horarioInicio) || !horarioValido(dados.horarioFim)) throw new Error("Informe horários válidos.");
        if (!Number.isInteger(limite) || limite < 1 || limite > 10000) throw new Error("O limite diário deve ficar entre 1 e 10.000.");
        if (!vendedor || vendedor.length > 80) {
            throw new Error("Informe o nome do vendedor com até 80 caracteres.");
        }
        const salvar = db.prepare(`INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`);
        db.transaction(() => {
            salvar.run("campaign_delay_ms", String(Math.round(segundos * 1000)));
            salvar.run("seller_name", vendedor);
            salvar.run("campaign_delay_min_ms", String(Math.round(minimo * 1000)));
            salvar.run("campaign_delay_max_ms", String(Math.round(maximo * 1000)));
            salvar.run("sending_start_time", dados.horarioInicio);
            salvar.run("sending_end_time", dados.horarioFim);
            salvar.run("daily_message_limit", String(limite));
            salvar.run("notify_campaign_complete", dados.notificarConclusao === false ? "0" : "1");
        })();
        return this.obterBot();
    }

    dentroHorario(config = this.obterBot(), agora = new Date()) {
        const atual = `${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}`;
        return config.horarioInicio <= config.horarioFim
            ? atual >= config.horarioInicio && atual <= config.horarioFim
            : atual >= config.horarioInicio || atual <= config.horarioFim;
    }

    mensagensEnviadasHoje() {
        return db.prepare("SELECT COUNT(*) AS total FROM messages WHERE status='enviado' AND date(enviado_em)=date('now','localtime')").get().total;
    }

    normalizarJid(telefone) {
        let numero = String(telefone ?? "").replace(/\D/g, "");
        if (!numero.startsWith("55")) numero = `55${numero}`;
        if (!/^55\d{10,11}$/.test(numero)) throw new Error("Informe um telefone válido com DDD.");
        return `${numero}@s.whatsapp.net`;
    }

    listarBloqueados() { return db.prepare("SELECT * FROM blocked_contacts ORDER BY created_at DESC").all(); }
    estaBloqueado(jid) { return Boolean(db.prepare("SELECT id FROM blocked_contacts WHERE jid=?").get(jid)); }
    bloquear(telefone, motivo) {
        const jid = this.normalizarJid(telefone);
        db.prepare("INSERT OR IGNORE INTO blocked_contacts(jid,reason) VALUES(?,?)").run(jid, String(motivo ?? "").trim() || null);
        return this.listarBloqueados();
    }
    desbloquear(id) { db.prepare("DELETE FROM blocked_contacts WHERE id=?").run(id); return { success: true }; }

    obter() {
        const tamanhoBanco = fs.existsSync(db.name) ? fs.statSync(db.name).size : 0;
        const bot = this.obterBot();
        return {
            porta: Number(process.env.PORT || 3000),
            ...bot,
            banco: path.basename(db.name),
            tamanhoBanco,
            ambiente: process.env.NODE_ENV || "development"
        };
    }

    async criarBackup() {
        const pasta = path.join(databaseDir, "backups");
        fs.mkdirSync(pasta, { recursive: true });
        const data = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
        const arquivo = path.join(pasta, `baileybot-${data}.db`);
        await db.backup(arquivo);
        return arquivo;
    }
}

export default new SettingsService();
