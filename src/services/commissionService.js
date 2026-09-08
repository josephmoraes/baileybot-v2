import XLSX from "xlsx";
import db from "../database/database.js";
import fileImportService from "./fileImportService.js";

const hoje = () => new Date().toISOString().slice(0, 10);
const chave = valor => String(valor ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const campo = (linha, nomes) => {
    const mapa = Object.fromEntries(Object.entries(linha).map(([k, v]) => [chave(k), v]));
    for (const nome of nomes) if (mapa[chave(nome)] !== undefined && String(mapa[chave(nome)]).trim()) return mapa[chave(nome)];
    return "";
};
const numero = valor => {
    if (typeof valor === "number") return valor;
    const texto = String(valor ?? "").replace(/R\$|\s/g, "");
    return Number(texto.includes(",") ? texto.replaceAll(".", "").replace(",", ".") : texto);
};
const dataIso = valor => {
    if (typeof valor === "number") return XLSX.SSF.format("yyyy-mm-dd", valor);
    const texto = String(valor ?? "").trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(texto)) return texto.slice(0, 10);
    const partes = texto.split(/[\/\-]/);
    if (partes.length === 3) return `${partes[2].padStart(4, "20")}-${partes[1].padStart(2, "0")}-${partes[0].padStart(2, "0")}`;
    return "";
};
const somarDias = (data, dias) => { const d = new Date(`${data}T12:00:00`); d.setDate(d.getDate() + dias); return d.toISOString().slice(0, 10); };
const fimDoMes = data => {
    const [ano, mes] = data.split("-").map(Number);
    return new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);
};
const TAXA_COMISSAO_PADRAO = 3;

class CommissionService {
    listarTecnicos() {
        return db.prepare(`SELECT t.*, COALESCE(SUM(c.commission_value),0) total,
            COALESCE(SUM(CASE WHEN c.status='liberada' AND NOT EXISTS (
                SELECT 1 FROM credit_request_commissions rc WHERE rc.commission_id=c.id
            ) THEN c.commission_value ELSE 0 END),0) liberado,
            COALESCE(SUM(CASE WHEN c.status='pendente' THEN c.commission_value ELSE 0 END),0) pendente,
            COALESCE(SUM((SELECT SUM(rc.amount) FROM credit_request_commissions rc WHERE rc.commission_id=c.id)),0) resgatado
            FROM technicians t LEFT JOIN commissions c ON c.technician_id=t.id GROUP BY t.id ORDER BY t.name`).all();
    }
    obterTaxaPadrao() {
        return Number(db.prepare("SELECT value FROM app_settings WHERE key='default_commission_rate'").get()?.value ?? TAXA_COMISSAO_PADRAO);
    }
    obterPeriodoFechamento() {
        const tipo = db.prepare("SELECT value FROM app_settings WHERE key='commission_release_rule'").get()?.value ?? "month_end";
        const dias = Number(db.prepare("SELECT value FROM app_settings WHERE key='commission_release_days'").get()?.value ?? 15);
        return { tipo: tipo === "days_after_sale" ? tipo : "month_end", dias };
    }
    validarPeriodoFechamento(dados = {}) {
        const tipo = String(dados.tipo || "");
        const dias = Number(dados.dias);
        if (!["month_end", "days_after_sale"].includes(tipo)) throw new Error("Selecione um período de fechamento válido.");
        if (tipo === "days_after_sale" && (!Number.isInteger(dias) || dias < 0 || dias > 365)) {
            throw new Error("Informe um prazo entre 0 e 365 dias.");
        }
        return { tipo, dias: tipo === "days_after_sale" ? dias : this.obterPeriodoFechamento().dias };
    }
    calcularDataLiberacao(dataVenda, periodo = this.obterPeriodoFechamento()) {
        return periodo.tipo === "days_after_sale" ? somarDias(dataVenda, periodo.dias) : fimDoMes(dataVenda);
    }
    preverAlteracaoPeriodoFechamento(dados) {
        const periodoAtual = this.obterPeriodoFechamento();
        const novoPeriodo = this.validarPeriodoFechamento(dados);
        const comissoes = db.prepare(`SELECT c.id,c.sale_date,c.release_date,c.status FROM commissions c
            JOIN technicians t ON t.id=c.technician_id WHERE t.is_test=0 AND NOT EXISTS (
                SELECT 1 FROM credit_request_commissions rc WHERE rc.commission_id=c.id
            )`).all();
        let alteradas = 0, passamParaLiberada = 0, voltamParaPendente = 0;
        for (const comissao of comissoes) {
            const novaData = this.calcularDataLiberacao(comissao.sale_date, novoPeriodo);
            const novoStatus = novaData <= hoje() ? "liberada" : "pendente";
            if (novaData !== comissao.release_date) alteradas++;
            if (comissao.status !== novoStatus && novoStatus === "liberada") passamParaLiberada++;
            if (comissao.status !== novoStatus && novoStatus === "pendente") voltamParaPendente++;
        }
        const preservadas = db.prepare(`SELECT COUNT(*) quantidade FROM commissions c JOIN technicians t ON t.id=c.technician_id
            WHERE t.is_test=0 AND EXISTS (SELECT 1 FROM credit_request_commissions rc WHERE rc.commission_id=c.id)`).get().quantidade;
        return { periodoAtual, novoPeriodo, analisadas: comissoes.length, alteradas, passamParaLiberada, voltamParaPendente, preservadasResgatadas: preservadas };
    }
    alterarPeriodoFechamento(dados) {
        const impacto = this.preverAlteracaoPeriodoFechamento(dados);
        const comissoes = db.prepare(`SELECT c.id,c.sale_date FROM commissions c JOIN technicians t ON t.id=c.technician_id
            WHERE t.is_test=0 AND NOT EXISTS (SELECT 1 FROM credit_request_commissions rc WHERE rc.commission_id=c.id)`).all();
        const salvar = db.prepare(`INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`);
        const atualizar = db.prepare("UPDATE commissions SET release_date=?,status=? WHERE id=?");
        db.transaction(() => {
            salvar.run("commission_release_rule", impacto.novoPeriodo.tipo);
            salvar.run("commission_release_days", String(impacto.novoPeriodo.dias));
            for (const comissao of comissoes) {
                const liberacao = this.calcularDataLiberacao(comissao.sale_date, impacto.novoPeriodo);
                atualizar.run(liberacao, liberacao <= hoje() ? "liberada" : "pendente", comissao.id);
            }
        })();
        return impacto;
    }
    salvarTecnico(dados, id) {
        if (!dados.name?.trim() || !dados.og1Code?.trim()) throw new Error("Nome e código OG1 são obrigatórios.");
        const existente = id ? db.prepare("SELECT * FROM technicians WHERE id=?").get(id) : null;
        if (id && !existente) throw new Error("Técnico não encontrado.");
        const perfilTeste = Boolean(existente?.is_test);
        const creditoTeste = Number(dados.testAvailableCredit);
        if (perfilTeste && dados.testAvailableCredit !== undefined && (!Number.isFinite(creditoTeste) || creditoTeste < 0 || creditoTeste > 100000000)) {
            throw new Error("Informe um crédito de teste válido.");
        }
        const taxaInformada = String(dados.commissionRate ?? "").trim();
        const taxa = perfilTeste && taxaInformada !== "" && Number.isFinite(Number(taxaInformada)) && Number(taxaInformada) >= 0
            ? Number(taxaInformada)
            : existente?.commission_rate ?? this.obterTaxaPadrao();
        const params = [perfilTeste ? existente.name : dados.name.trim(), perfilTeste ? existente.og1_code : dados.og1Code.trim(), dados.phone?.trim() || null, dados.email?.trim() || null, dados.document?.trim() || null, taxa, perfilTeste ? 1 : dados.active === false ? 0 : 1];
        try {
            if (id) {
                const r = db.prepare(`UPDATE technicians SET name=?,og1_code=?,phone=?,email=?,document=?,commission_rate=?,active=? WHERE id=?`).run(...params, id);
                if (!r.changes) throw new Error("Técnico não encontrado.");
            } else db.prepare(`INSERT INTO technicians(name,og1_code,phone,email,document,commission_rate,active) VALUES(?,?,?,?,?,?,?)`).run(...params);
        } catch (erro) { if (erro.code === "SQLITE_CONSTRAINT_UNIQUE") throw new Error("Código OG1 já cadastrado."); throw erro; }
        if (perfilTeste && dados.testAvailableCredit !== undefined) this.definirCreditoTeste(id, dados.testAvailableCredit);
        return { success: true };
    }
    definirCreditoTeste(id, valor) {
        const tecnicoId = Number(id);
        const credito = Number(valor);
        if (!Number.isFinite(credito) || credito < 0 || credito > 100000000) throw new Error("Informe um crédito de teste válido.");
        const tecnico = db.prepare("SELECT * FROM technicians WHERE id=? AND is_test=1").get(tecnicoId);
        if (!tecnico) throw new Error("A edição manual de créditos é permitida somente no perfil Testes.");
        const livres = db.prepare(`SELECT c.id FROM commissions c WHERE c.technician_id=? AND c.source_filename='TESTE_MANUAL'
            AND NOT EXISTS (SELECT 1 FROM credit_request_commissions rc WHERE rc.commission_id=c.id)`).all(tecnicoId);
        db.transaction(() => {
            for (const item of livres) db.prepare("DELETE FROM commissions WHERE id=?").run(item.id);
            if (credito > 0) {
                const taxa = Number(tecnico.commission_rate);
                const valorVenda = taxa > 0 ? Number((credito * 100 / taxa).toFixed(2)) : credito;
                const movimento = `TESTE-MANUAL-${tecnicoId}-${Date.now()}`;
                db.prepare(`INSERT INTO commissions(movement,document_number,commissioned_code,commissioned_name,source_filename,
                    technician_id,sale_date,sale_value,rate,commission_value,release_date,status)
                    VALUES(?,?,?,?,?,?,?,?,?,?,?,'liberada')`).run(movimento,movimento,tecnico.og1_code,tecnico.name,"TESTE_MANUAL",tecnicoId,hoje(),valorVenda,taxa,credito,hoje());
            }
        })();
        return this.listarTecnicos().find(item => item.id === tecnicoId);
    }
    preverAlteracaoTaxaPadrao(rate) {
        const novaTaxa = Number(rate);
        if (!Number.isFinite(novaTaxa) || novaTaxa < 0 || novaTaxa > 100) throw new Error("Informe um percentual entre 0 e 100.");
        const elegiveis = db.prepare(`SELECT COUNT(*) quantidade,
            COALESCE(SUM(commission_value),0) valor_anterior,
            COALESCE(SUM(ROUND(sale_value * ? / 100,2)),0) valor_novo
            FROM commissions c JOIN technicians t ON t.id=c.technician_id WHERE t.is_test=0 AND NOT EXISTS (
                SELECT 1 FROM credit_request_commissions rc WHERE rc.commission_id=c.id
            )`).get(novaTaxa);
        const resgatadas = db.prepare(`SELECT COUNT(*) quantidade,COALESCE(SUM(c.commission_value),0) valor
            FROM commissions c JOIN technicians t ON t.id=c.technician_id WHERE t.is_test=0 AND EXISTS (
                SELECT 1 FROM credit_request_commissions rc WHERE rc.commission_id=c.id
            )`).get();
        return {
            taxaAtual: this.obterTaxaPadrao(),
            novaTaxa,
            recalculadas: elegiveis.quantidade,
            valorAnterior: elegiveis.valor_anterior,
            valorNovo: elegiveis.valor_novo,
            ignoradasResgatadas: resgatadas.quantidade,
            valorResgatadoPreservado: resgatadas.valor
        };
    }
    alterarTaxaPadrao(rate) {
        const impacto = this.preverAlteracaoTaxaPadrao(rate);
        const vendas = db.prepare(`SELECT c.* FROM commissions c JOIN technicians t ON t.id=c.technician_id
            WHERE t.is_test=0 AND NOT EXISTS (
            SELECT 1 FROM credit_request_commissions rc WHERE rc.commission_id=c.id
        )`).all();
        const salvarConfiguracao = db.prepare(`INSERT INTO app_settings(key,value,updated_at)
            VALUES('default_commission_rate',?,CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`);
        const registrar = db.prepare(`INSERT INTO commission_rate_adjustments
            (commission_id,previous_rate,new_rate,previous_value,new_value,reason,adjusted_by)
            VALUES(?,?,?,?,?,'Alteração da comissão padrão nas configurações','Administrador local')`);
        const atualizar = db.prepare(`UPDATE commissions SET original_rate=COALESCE(original_rate,rate),
            rate=?,commission_value=?,adjustment_reason='Alteração da comissão padrão nas configurações',
            adjusted_at=CURRENT_TIMESTAMP,adjusted_by='Administrador local' WHERE id=?`);
        db.transaction(() => {
            salvarConfiguracao.run(String(impacto.novaTaxa));
            db.prepare("UPDATE technicians SET commission_rate=? WHERE is_test=0").run(impacto.novaTaxa);
            for (const venda of vendas) {
                const novoValor = Number((Number(venda.sale_value) * impacto.novaTaxa / 100).toFixed(2));
                if (Number(venda.rate) !== impacto.novaTaxa || Number(venda.commission_value) !== novoValor) {
                    registrar.run(venda.id, venda.rate, impacto.novaTaxa, venda.commission_value, novoValor);
                    atualizar.run(impacto.novaTaxa, novoValor, venda.id);
                }
            }
            db.prepare(`UPDATE commission_imports SET commission_total=COALESCE((
                SELECT SUM(c.commission_value) FROM commissions c WHERE c.import_id=commission_imports.id
            ),0)`).run();
        })();
        return impacto;
    }
    excluirTecnico(id) {
        const tecnicoId = Number(id);
        if (!Number.isInteger(tecnicoId) || tecnicoId <= 0) throw new Error("Técnico inválido.");
        const tecnico = db.prepare("SELECT id,name FROM technicians WHERE id=?").get(tecnicoId);
        if (!tecnico) throw new Error("Técnico não encontrado.");
        const envioAtivo = db.prepare(`SELECT 1 FROM commission_notification_recipients r
            JOIN commission_notification_jobs j ON j.id=r.job_id
            WHERE r.technician_id=? AND j.status IN ('pendente','processando','cancelando') LIMIT 1`).get(tecnicoId);
        if (envioAtivo) throw new Error("Cancele ou aguarde o envio de créditos deste técnico terminar antes de excluí-lo.");

        const impacto = db.prepare(`SELECT
            (SELECT COUNT(*) FROM commissions WHERE technician_id=?) commissions,
            (SELECT COUNT(*) FROM credit_requests WHERE technician_id=?) requests,
            (SELECT COUNT(*) FROM commission_notification_recipients WHERE technician_id=?) notifications`).get(tecnicoId, tecnicoId, tecnicoId);
        const excluir = db.transaction(() => {
            const jobs = db.prepare("SELECT DISTINCT job_id FROM commission_notification_recipients WHERE technician_id=?").all(tecnicoId).map(item => item.job_id);
            db.prepare(`DELETE FROM credit_request_commissions WHERE request_id IN
                (SELECT id FROM credit_requests WHERE technician_id=?)`).run(tecnicoId);
            db.prepare(`DELETE FROM credit_request_commissions WHERE commission_id IN
                (SELECT id FROM commissions WHERE technician_id=?)`).run(tecnicoId);
            db.prepare("DELETE FROM credit_requests WHERE technician_id=?").run(tecnicoId);
            db.prepare("DELETE FROM commission_notification_recipients WHERE technician_id=?").run(tecnicoId);
            db.prepare("DELETE FROM commissions WHERE technician_id=?").run(tecnicoId);
            for (const jobId of jobs) {
                const totais = db.prepare(`SELECT COUNT(*) total,
                    SUM(CASE WHEN status='enviado' THEN 1 ELSE 0 END) sent,
                    SUM(CASE WHEN status='falhou' THEN 1 ELSE 0 END) failed,
                    SUM(CASE WHEN status<>'pendente' THEN 1 ELSE 0 END) processed
                    FROM commission_notification_recipients WHERE job_id=?`).get(jobId);
                if (!totais.total) db.prepare("DELETE FROM commission_notification_jobs WHERE id=?").run(jobId);
                else db.prepare("UPDATE commission_notification_jobs SET total=?,processed=?,sent=?,failed=? WHERE id=?")
                    .run(totais.total, totais.processed || 0, totais.sent || 0, totais.failed || 0, jobId);
            }
            const resultado = db.prepare("DELETE FROM technicians WHERE id=?").run(tecnicoId);
            if (!resultado.changes) throw new Error("Técnico não encontrado.");
        });
        excluir();
        return { success: true, technician: tecnico, removed: impacto };
    }
    dashboard() {
        this.atualizarLiberacoes();
        const resumo = db.prepare(`SELECT
            (SELECT COUNT(*) FROM technicians WHERE active=1) tecnicos,
            (SELECT COUNT(*) FROM technicians) tecnicos_total,
            COUNT(CASE WHEN substr(sale_date,1,7)=substr(?,1,7) THEN 1 END) vendas_count,
            COALESCE(SUM(CASE WHEN substr(sale_date,1,7)=substr(?,1,7) THEN sale_value ELSE 0 END),0) vendas,
            COALESCE(SUM(CASE WHEN substr(sale_date,1,7)=substr(?,1,7) THEN commission_value ELSE 0 END),0) comissoes,
            COALESCE(SUM(CASE WHEN status='liberada' THEN commission_value ELSE 0 END),0) liberado,
            COUNT(CASE WHEN status='liberada' THEN 1 END) liberadas_count,
            COALESCE(SUM(CASE WHEN status='pendente' THEN commission_value ELSE 0 END),0) pendente,
            COUNT(CASE WHEN status='pendente' THEN 1 END) pendentes_count
            FROM commissions`).get(hoje(), hoje(), hoje());

        const ranking = db.prepare(`SELECT t.name,t.og1_code,COUNT(c.id) vendas_count,
            COALESCE(SUM(c.sale_value),0) total,COALESCE(SUM(c.commission_value),0) comissao
            FROM technicians t JOIN commissions c ON c.technician_id=t.id
            GROUP BY t.id ORDER BY total DESC LIMIT 5`).all();

        const mensal = db.prepare(`WITH RECURSIVE meses(mes) AS (
            SELECT strftime('%Y-%m','now','localtime','-5 months')
            UNION ALL SELECT strftime('%Y-%m',mes||'-01','+1 month') FROM meses WHERE mes<strftime('%Y-%m','now','localtime')
        ) SELECT meses.mes,COALESCE(SUM(c.sale_value),0) vendas,COALESCE(SUM(c.commission_value),0) comissoes
          FROM meses LEFT JOIN commissions c ON substr(c.sale_date,1,7)=meses.mes GROUP BY meses.mes ORDER BY meses.mes`).all();

        const distribuicao = db.prepare(`SELECT status,COUNT(*) quantidade,COALESCE(SUM(commission_value),0) valor
            FROM commissions GROUP BY status ORDER BY valor DESC`).all();

        const previsoes = [7,15,30].map(dias => db.prepare(`SELECT COUNT(*) quantidade,COALESCE(SUM(commission_value),0) valor
            FROM commissions WHERE status='pendente' AND release_date>? AND release_date<=date(?,'+'||?||' days')`).get(hoje(), hoje(), dias));

        const atividades = db.prepare(`SELECT tipo,titulo,descricao,data FROM (
            SELECT 'importacao' tipo,'Planilha importada' titulo,filename||' · '||imported_rows||' linha(s)' descricao,created_at data FROM commission_imports
            UNION ALL
            SELECT 'solicitacao','Solicitação '||COALESCE(number,'criada'),t.name||' · '||replace(printf('%.2f',r.amount),'.',',')||' créditos',r.created_at
            FROM credit_requests r JOIN technicians t ON t.id=r.technician_id
        ) ORDER BY datetime(data) DESC LIMIT 5`).all();

        const ultimaImportacao = db.prepare(`SELECT * FROM commission_imports ORDER BY id DESC LIMIT 1`).get() || null;
        const solicitacoesRascunho = db.prepare(`SELECT COUNT(*) quantidade,COALESCE(SUM(amount),0) valor FROM credit_requests WHERE status='rascunho'`).get();
        const semContato = db.prepare(`SELECT COUNT(*) total FROM technicians WHERE active=1 AND COALESCE(TRIM(phone),'')='' AND COALESCE(TRIM(email),'')=''`).get().total;
        const avisos = [];
        if (ultimaImportacao?.error_rows) avisos.push({ texto: `${ultimaImportacao.error_rows} linha(s) ignorada(s) na última importação.`, icone: "bi-file-earmark-excel" });
        if (solicitacoesRascunho.quantidade) avisos.push({ texto: `${solicitacoesRascunho.quantidade} solicitação(ões) em rascunho.`, icone: "bi-file-earmark-text" });
        if (semContato) avisos.push({ texto: `${semContato} técnico(s) ativo(s) sem telefone ou e-mail.`, icone: "bi-person-exclamation" });

        return {
            resumo,
            ranking,
            mensal,
            distribuicao,
            previsoes: previsoes.map((item, indice) => ({ dias: [7,15,30][indice], ...item })),
            atividades,
            avisos,
            ultimaImportacao,
            solicitacoesRascunho,
            atualizadoEm: new Date().toISOString()
        };
    }
    listarConsultasTecnicos() {
        return db.prepare(`SELECT i.id,i.technician_id,i.inquiry_date,i.notes,i.created_at,t.name technician_name,t.og1_code
            FROM commission_technician_inquiries i JOIN technicians t ON t.id=i.technician_id
            ORDER BY i.inquiry_date DESC,i.id DESC LIMIT 100`).all();
    }
    registrarConsultaTecnico(dados = {}) {
        const technicianId = Number(dados.technicianId);
        const tecnico = db.prepare("SELECT id FROM technicians WHERE id=?").get(technicianId);
        if (!tecnico) throw new Error("Selecione um técnico válido.");
        const inquiryDate = String(dados.inquiryDate || hoje()).slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(inquiryDate)) throw new Error("Informe uma data válida.");
        const result = db.prepare("INSERT INTO commission_technician_inquiries(technician_id,inquiry_date,notes) VALUES(?,?,?)")
            .run(technicianId, inquiryDate, String(dados.notes || "").trim() || null);
        return this.listarConsultasTecnicos().find(item => item.id === Number(result.lastInsertRowid));
    }
    excluirConsultaTecnico(id) {
        if (!db.prepare("DELETE FROM commission_technician_inquiries WHERE id=?").run(Number(id)).changes) throw new Error("Registro não encontrado.");
        return { success: true };
    }
    atualizarLiberacoes() { db.prepare(`UPDATE commissions SET status='liberada' WHERE status='pendente' AND release_date<=?`).run(hoje()); }
    listarComissoes() { this.atualizarLiberacoes(); return db.prepare(`SELECT c.*,t.name technician_name,t.og1_code FROM commissions c JOIN technicians t ON t.id=c.technician_id ORDER BY c.sale_date DESC,c.id DESC LIMIT 500`).all(); }
    ajustarPercentual(id, dados = {}) {
        const commissionId = Number(id);
        const novaTaxa = Number(dados.rate);
        const motivo = String(dados.reason || "").trim();
        if (!Number.isInteger(commissionId)) throw new Error("Venda inválida.");
        if (!Number.isFinite(novaTaxa) || novaTaxa < 0 || novaTaxa > 100) throw new Error("Informe um percentual entre 0 e 100.");
        if (!motivo) throw new Error("Informe o motivo da alteração.");
        const venda = db.prepare("SELECT * FROM commissions WHERE id=?").get(commissionId);
        if (!venda) throw new Error("Venda não encontrada.");
        if (db.prepare("SELECT 1 FROM credit_request_commissions WHERE commission_id=?").get(commissionId)) {
            throw new Error("Esta comissão já está vinculada a uma solicitação de crédito e não pode ser alterada.");
        }
        const novoValor = Number((Number(venda.sale_value) * novaTaxa / 100).toFixed(2));
        db.transaction(() => {
            db.prepare(`INSERT INTO commission_rate_adjustments(commission_id,previous_rate,new_rate,previous_value,new_value,reason,adjusted_by)
                VALUES(?,?,?,?,?,?,?)`).run(commissionId, venda.rate, novaTaxa, venda.commission_value, novoValor, motivo, "Administrador local");
            db.prepare(`UPDATE commissions SET original_rate=COALESCE(original_rate,rate),rate=?,commission_value=?,
                adjustment_reason=?,adjusted_at=CURRENT_TIMESTAMP,adjusted_by='Administrador local' WHERE id=?`)
                .run(novaTaxa, novoValor, motivo, commissionId);
            if (venda.import_id) {
                db.prepare(`UPDATE commission_imports SET commission_total=COALESCE((SELECT SUM(commission_value)
                    FROM commissions WHERE import_id=?),0) WHERE id=?`).run(venda.import_id, venda.import_id);
            }
        })();
        return this.obterAjuste(commissionId);
    }
    obterAjuste(id) {
        const venda = db.prepare(`SELECT c.*,t.name technician_name,t.og1_code FROM commissions c
            JOIN technicians t ON t.id=c.technician_id WHERE c.id=?`).get(id);
        if (!venda) throw new Error("Venda não encontrada.");
        venda.adjustments = db.prepare("SELECT * FROM commission_rate_adjustments WHERE commission_id=? ORDER BY created_at DESC,id DESC").all(id);
        return venda;
    }
    listarImportacoes() { return db.prepare(`SELECT i.*,
        CASE
            WHEN NOT EXISTS (SELECT 1 FROM commission_notification_recipients anyr WHERE anyr.import_id=i.id AND anyr.kind='novos_creditos') THEN 'nao_notificada'
            WHEN NOT EXISTS (
                SELECT 1 FROM commissions credit
                WHERE credit.import_id=i.id AND NOT EXISTS (
                    SELECT 1 FROM commission_notification_recipients sent
                    WHERE sent.import_id=i.id AND sent.technician_id=credit.technician_id
                      AND sent.kind='novos_creditos' AND sent.status='enviado'
                )
            ) THEN 'notificada'
            ELSE 'parcialmente_notificada'
        END notification_status,
        SUM(CASE WHEN r.status='enviado' THEN 1 ELSE 0 END) notification_sent,
        SUM(CASE WHEN r.status='falhou' THEN 1 ELSE 0 END) notification_failed,
        COUNT(r.id) notification_total
        FROM commission_imports i LEFT JOIN commission_notification_recipients r
          ON r.import_id=i.id AND r.kind='novos_creditos'
        GROUP BY i.id ORDER BY i.id DESC LIMIT 50`).all(); }
    impactoExclusaoImportacao(id) {
        const importacao = db.prepare("SELECT * FROM commission_imports WHERE id=?").get(id);
        if (!importacao) throw new Error("Relatório de importação não encontrado.");
        const impacto = db.prepare(`SELECT COUNT(*) commissions_count,COALESCE(SUM(sale_value),0) sales_total,
            COALESCE(SUM(commission_value),0) commission_total FROM commissions WHERE import_id=?`).get(id);
        const linkedRequests = db.prepare(`SELECT COUNT(DISTINCT rc.request_id) total FROM credit_request_commissions rc
            JOIN commissions c ON c.id=rc.commission_id WHERE c.import_id=?`).get(id).total;
        const activeNotifications = db.prepare(`SELECT COUNT(*) total FROM commission_notification_jobs
            WHERE import_id=? AND status IN ('pendente','processando','cancelando')`).get(id).total;
        return { import: importacao, ...impacto, linked_requests: linkedRequests, active_notifications: activeNotifications };
    }
    excluirImportacao(id, mode) {
        if (!["report", "report_and_commissions"].includes(mode)) throw new Error("Escolha uma opção de exclusão válida.");
        const impacto = this.impactoExclusaoImportacao(id);
        if (impacto.active_notifications) throw new Error("Aguarde a notificação deste relatório terminar antes de excluí-lo.");
        if (mode === "report_and_commissions" && impacto.linked_requests) {
            throw new Error("Não é possível excluir as comissões: existem créditos deste relatório vinculados a uma solicitação.");
        }
        db.transaction(() => {
            if (mode === "report_and_commissions") {
                db.prepare("DELETE FROM commission_notification_jobs WHERE import_id=?").run(id);
                db.prepare("DELETE FROM commissions WHERE import_id=?").run(id);
            }
            const resultado = db.prepare("DELETE FROM commission_imports WHERE id=?").run(id);
            if (!resultado.changes) throw new Error("Relatório de importação não encontrado.");
        })();
        return {
            success: true,
            mode,
            removed_report: true,
            removed_commissions: mode === "report_and_commissions" ? impacto.commissions_count : 0,
            preserved_commissions: mode === "report" ? impacto.commissions_count : 0
        };
    }
    async importar({ base64, filename }) {
        const linhas = await fileImportService.extrairLinhas({ base64, filename });
        return this.processarLinhas(linhas, filename || "importacao.xlsx", false);
    }
    async preverImportacao({ base64, filename }) {
        const linhas = await fileImportService.extrairLinhas({ base64, filename });
        return this.processarLinhas(linhas, filename || "importacao.xlsx", true);
    }
    processarLinhas(linhas, filename, previa) {
        const documentosExistentes = new Set(db.prepare(`SELECT COALESCE(document_number,movement) documento FROM commissions`).all().map(item => String(item.documento)));
        const documentosArquivo = new Set();
        const registros = [];
        let comComissionado=0,duplicados=0,invalidos=0;
        for (const linha of linhas) {
            const codigo=String(campo(linha,["codigo cliente comissionado","codigo do cliente comissionado","codigo comissionado","codigo do comissionado","codigo tecnico","codigo og1"])).trim();
            const nome=String(campo(linha,["nome cliente comissionado","nome do cliente comissionado","nome comissionado","nome do comissionado","nome tecnico"])).trim();
            if (!codigo || !nome) { invalidos++; continue; }
            comComissionado++;
            const documento=String(campo(linha,["numero documento","numero do documento","documento","movimento","numero","venda","pedido"])).trim();
            const valor=numero(campo(linha,["valor venda","valor da venda","valor documento","valor","total"]));
            const data=dataIso(campo(linha,["data venda","data da venda","data documento","data","emissao"]));
            if (!documento || !data || !Number.isFinite(valor) || valor<=0) { invalidos++; continue; }
            if (documentosExistentes.has(documento) || documentosArquivo.has(documento)) { duplicados++; continue; }
            documentosArquivo.add(documento);
            registros.push({
                codigo,nome,documento,valor,data,
                cliente:String(campo(linha,["cliente da venda","nome cliente venda","cliente","razao social"])).trim() || null,
                vendedor:String(campo(linha,["vendedor do relatorio","vendedor relatorio","vendedor","nome vendedor"])).trim() || null,
                taxa:numero(campo(linha,["percentual","comissao percentual","taxa"]))
            });
        }
        const resumo={total:linhas.length,comComissionado,importados:registros.length,duplicados,invalidos,erros:invalidos,vendas:0,comissoes:0,tecnicosCriados:0,previa};
        if (previa) return resumo;
        db.transaction(()=>{
            const imp=db.prepare(`INSERT INTO commission_imports(filename,total_rows,commissioned_rows,duplicate_rows) VALUES(?,?,?,?)`).run(filename,linhas.length,comComissionado,duplicados).lastInsertRowid;
            const buscarTecnico=db.prepare(`SELECT * FROM technicians WHERE og1_code=?`);
            const criarTecnico=db.prepare(`INSERT INTO technicians(name,og1_code,commission_rate) VALUES(?,?,?)`);
            const inserir=db.prepare(`INSERT INTO commissions(movement,document_number,commissioned_code,commissioned_name,customer_name,report_seller,source_filename,imported_at,technician_id,sale_date,sale_value,rate,commission_value,release_date,status,import_id) VALUES(?,?,?,?,?,?,?,CURRENT_TIMESTAMP,?,?,?,?,?,?,?,?)`);
            for (const registro of registros) {
                let tecnico=buscarTecnico.get(registro.codigo);
                if (!tecnico) {
                    criarTecnico.run(registro.nome,registro.codigo,registro.taxa || this.obterTaxaPadrao());
                    tecnico=buscarTecnico.get(registro.codigo);
                    resumo.tecnicosCriados++;
                }
                const taxa=registro.taxa || tecnico.commission_rate;
                const comissao=Number((registro.valor*taxa/100).toFixed(2));
                const liberacao=this.calcularDataLiberacao(registro.data);
                inserir.run(registro.documento,registro.documento,registro.codigo,registro.nome,registro.cliente,registro.vendedor,filename,tecnico.id,registro.data,registro.valor,taxa,comissao,liberacao,liberacao<=hoje()?"liberada":"pendente",imp);
                resumo.vendas+=registro.valor; resumo.comissoes+=comissao;
            }
            db.prepare(`UPDATE commission_imports SET imported_rows=?,error_rows=?,sales_total=?,commission_total=? WHERE id=?`).run(resumo.importados,resumo.invalidos,resumo.vendas,resumo.comissoes,imp);
        })();
        return resumo;
    }
    creditosDisponiveis(tecnicoId) { this.atualizarLiberacoes(); return db.prepare(`SELECT c.* FROM commissions c LEFT JOIN credit_request_commissions rc ON rc.commission_id=c.id WHERE c.technician_id=? AND c.status='liberada' AND rc.commission_id IS NULL ORDER BY c.release_date`).all(tecnicoId); }
    criarSolicitacao(d) {
        const ids=[...new Set((d.commissionIds||[]).map(Number).filter(Number.isInteger))];
        if(!d.technicianId||!ids.length||!d.requester?.trim()) throw new Error("Técnico, créditos e responsável são obrigatórios.");
        const creditos=this.creditosDisponiveis(d.technicianId).filter(c=>ids.includes(c.id));
        if(creditos.length!==ids.length) throw new Error("Um ou mais créditos não estão disponíveis.");
        const total=creditos.reduce((s,c)=>s+c.commission_value,0);
        const criar=db.transaction(()=>{ const r=db.prepare(`INSERT INTO credit_requests(technician_id,amount,request_date,requester,destination,materials,notes,status) VALUES(?,?,?,?,?,?,?,?)`).run(d.technicianId,total,d.requestDate||hoje(),d.requester.trim(),d.destination||"Financeiro",d.materials||null,d.notes||null,d.draft?"rascunho":"gerada"); const numeroReq=`SC-${new Date().getFullYear()}-${String(r.lastInsertRowid).padStart(4,"0")}`; db.prepare(`UPDATE credit_requests SET number=? WHERE id=?`).run(numeroReq,r.lastInsertRowid); const link=db.prepare(`INSERT INTO credit_request_commissions(request_id,commission_id,amount) VALUES(?,?,?)`); creditos.forEach(c=>link.run(r.lastInsertRowid,c.id,c.commission_value)); return {id:r.lastInsertRowid,number:numeroReq,amount:total}; });
        return criar();
    }
    obterSolicitacao(id) {
        const solicitacao = db.prepare(`SELECT r.*,t.name technician_name,t.og1_code
            FROM credit_requests r JOIN technicians t ON t.id=r.technician_id WHERE r.id=?`).get(id);
        if (!solicitacao) throw new Error("Solicitação não encontrada.");
        solicitacao.comissoes = db.prepare(`SELECT c.movement,c.document_number,c.sale_date,c.sale_value,c.rate,rc.amount rescued_amount
            FROM credit_request_commissions rc JOIN commissions c ON c.id=rc.commission_id
            WHERE rc.request_id=? ORDER BY c.sale_date,c.id`).all(id);
        return solicitacao;
    }
    salvarPdfSolicitacao(id, pdf) {
        if (!Buffer.isBuffer(pdf) || pdf.subarray(0, 5).toString() !== "%PDF-") throw new Error("O PDF gerado é inválido.");
        const solicitacao = db.prepare("SELECT number,status FROM credit_requests WHERE id=?").get(id);
        if (!solicitacao) throw new Error("Solicitação não encontrada.");
        if (solicitacao.status !== "gerada") throw new Error("Rascunhos não possuem PDF.");
        const filename = `${solicitacao.number}.pdf`;
        db.prepare(`UPDATE credit_requests SET pdf_data=?,pdf_filename=?,pdf_mime_type='application/pdf',
            pdf_generated_at=CURRENT_TIMESTAMP WHERE id=?`).run(pdf, filename, id);
        return { filename, mimeType: "application/pdf", size: pdf.length };
    }
    obterPdfSolicitacao(id) {
        const registro = db.prepare(`SELECT number,status,pdf_data,pdf_filename,pdf_mime_type,pdf_generated_at
            FROM credit_requests WHERE id=?`).get(id);
        if (!registro) throw new Error("Solicitação não encontrada.");
        if (registro.status !== "gerada") throw new Error("Rascunhos não possuem PDF.");
        if (!registro.pdf_data) return null;
        return {
            data: Buffer.from(registro.pdf_data),
            filename: registro.pdf_filename || `${registro.number}.pdf`,
            mimeType: registro.pdf_mime_type || "application/pdf",
            generatedAt: registro.pdf_generated_at
        };
    }
    excluirSolicitacaoIncompleta(id) {
        db.prepare("DELETE FROM credit_requests WHERE id=? AND pdf_data IS NULL").run(id);
    }
    listarSolicitacoes(){ return db.prepare(`SELECT r.id,r.number,r.technician_id,r.amount,r.request_date,r.requester,
        r.destination,r.materials,r.notes,r.status,r.created_at,r.pdf_filename,r.pdf_generated_at,
        CASE WHEN r.pdf_data IS NULL THEN 0 ELSE 1 END pdf_available,t.name technician_name,t.og1_code
        FROM credit_requests r JOIN technicians t ON t.id=r.technician_id ORDER BY r.id DESC`).all(); }
}
export default new CommissionService();
