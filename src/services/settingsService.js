import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import db from "../database/database.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const databaseDir = path.resolve(__dirname, "../../database");
const VENDEDORES_PADRAO = ["Alisson", "Noberto", "Aldener", "Letícia", "Joseph", "Clayton", "Outros"];
const chaveVendedor = valor => String(valor ?? "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

class SettingsService {
    obterTemplateContatosVendedor() {
        return this.obterValor("seller_assignment_message", "Olá, {vendedor}!\n\nContatos atribuídos para {data_contato}:\n\n{lista_contatos}\n\nBom trabalho!");
    }

    salvarTemplateContatosVendedor(mensagem) {
        const texto = String(mensagem ?? "").trim();
        if (!texto) throw new Error("Informe a mensagem do vendedor.");
        if (!texto.includes("{lista_contatos}")) throw new Error("A mensagem precisa conter {lista_contatos}.");
        db.prepare(`INSERT INTO app_settings(key,value,updated_at) VALUES('seller_assignment_message',?,CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`).run(texto);
        return this.obterTemplateContatosVendedor();
    }
    obterValor(chave, padrao = "") {
        return db.prepare("SELECT value FROM app_settings WHERE key = ?").get(chave)?.value ?? padrao;
    }

    obterBot() {
        return {
            nomeVendedor: this.obterValor("seller_name", "Noberto"),
            intervaloMinimoMs: Number(this.obterValor("campaign_delay_min_ms", String(process.env.CAMPAIGN_DELAY_MIN_MS ?? 60000))),
            intervaloMaximoMs: Number(this.obterValor("campaign_delay_max_ms", String(process.env.CAMPAIGN_DELAY_MAX_MS ?? 180000))),
            horarioInicio: this.obterValor("sending_start_time", "08:00"),
            horarioFim: this.obterValor("sending_end_time", "18:00"),
            limiteDiario: Number(this.obterValor("daily_message_limit", "200")),
            notificarConclusao: this.obterValor("notify_campaign_complete", "1") === "1",
            taxaComissaoPadrao: Number(this.obterValor("default_commission_rate", "3")),
            periodoFechamentoComissoes: {
                tipo: this.obterValor("commission_release_rule", "month_end"),
                dias: Number(this.obterValor("commission_release_days", "15"))
            }
        };
    }

    listarVendedores() {
        try {
            const salvos = JSON.parse(this.obterValor("registered_sellers", "[]"));
            const nomes = [...VENDEDORES_PADRAO, ...(Array.isArray(salvos) ? salvos : [])]
                .map(nome => String(nome ?? "").trim()).filter(Boolean);
            return [...new Map(nomes.map(nome => [chaveVendedor(nome), nome])).values()];
        } catch { return [...VENDEDORES_PADRAO]; }
    }

    normalizarVendedor(valor) {
        const nome = String(valor ?? "").trim();
        if (!nome) return "Outros";
        return this.listarVendedores().find(item => chaveVendedor(item) === chaveVendedor(nome)) || "Outros";
    }

    adicionarVendedor(valor) {
        const nome = String(valor ?? "").trim();
        if (!nome || nome.length > 80) throw new Error("Informe um vendedor com até 80 caracteres.");
        const atuais = this.listarVendedores();
        if (atuais.some(item => chaveVendedor(item) === chaveVendedor(nome))) throw new Error("Este vendedor já está cadastrado.");
        const adicionais = atuais.filter(item => !VENDEDORES_PADRAO.some(padrao => chaveVendedor(padrao) === chaveVendedor(item)));
        db.prepare(`INSERT INTO app_settings(key,value,updated_at) VALUES('registered_sellers',?,CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`).run(JSON.stringify([...adicionais, nome]));
        return this.listarVendedores();
    }

    listarPerfisVendedores() {
        let telefones = [];
        try { telefones = JSON.parse(this.obterValor("seller_profiles", "[]")); } catch { telefones = []; }
        return this.listarVendedores().filter(nome => nome !== "Outros").map(nome => {
            const perfil = Array.isArray(telefones) && telefones.find(item => chaveVendedor(item?.name) === chaveVendedor(nome));
            return { name: nome, phone: perfil?.phone || "" };
        });
    }

    salvarPerfilVendedor(dados = {}) {
        const name = this.normalizarVendedor(dados.name);
        if (name === "Outros") throw new Error("Escolha um vendedor cadastrado.");
        const phone = String(dados.phone ?? "").replace(/\D/g, "");
        if (phone && !/^(?:55)?\d{10,11}$/.test(phone)) throw new Error("Informe um telefone válido com DDD.");
        let perfis = [];
        try { perfis = JSON.parse(this.obterValor("seller_profiles", "[]")); } catch { perfis = []; }
        perfis = (Array.isArray(perfis) ? perfis : []).filter(item => chaveVendedor(item?.name) !== chaveVendedor(name));
        perfis.push({ name, phone });
        db.prepare(`INSERT INTO app_settings(key,value,updated_at) VALUES('seller_profiles',?,CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`).run(JSON.stringify(perfis));
        return this.listarPerfisVendedores().find(item => item.name === name);
    }

    salvarBot(dados) {
        const minimo = Number(dados.intervaloMinimoSegundos);
        const maximo = Number(dados.intervaloMaximoSegundos);
        const limite = Number(dados.limiteDiario);
        const horarioValido = valor => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(valor));
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
