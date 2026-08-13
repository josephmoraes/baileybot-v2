import db from "../database/database.js";
import fileImportService from "./fileImportService.js";
import { cleanCustomerName } from "../utils/customerName.js";

export const VENDEDORES_OFICIAIS = ["Alisson", "Noberto", "Aldener", "Letícia", "Clayton"];
export const STATUS_REATIVACAO = ["Último Contato", "Entrar em contato", "Contatado", "Avulso", "Recente", "Aguardando", "Sem Contato", "Não ligar", "-"];

const texto = valor => String(valor ?? "").trim();
const chave = valor => texto(valor).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const cabecalho = (linha, nomes) => {
    const mapa = new Map(Object.entries(linha || {}).map(([nome, valor]) => [chave(nome), valor]));
    for (const nome of nomes) if (mapa.has(chave(nome))) return mapa.get(chave(nome));
    return "";
};
const dinheiro = valor => {
    if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0;
    const limpo = texto(valor).replace(/R\$\s*/i, "").replace(/\s/g, "");
    const normalizado = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
    return Number(normalizado) || 0;
};
const dataIso = valor => {
    if (!valor) return null;
    if (typeof valor === "number") {
        const base = new Date(Date.UTC(1899, 11, 30));
        base.setUTCDate(base.getUTCDate() + valor);
        return base.toISOString().slice(0, 10);
    }
    const bruto = texto(valor);
    const br = bruto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
    const data = new Date(bruto);
    return Number.isNaN(data.getTime()) ? null : data.toISOString().slice(0, 10);
};
const telefoneJid = valor => {
    let numero = texto(valor).replace(/\D/g, "");
    if (!numero) return null;
    if (!numero.startsWith("55")) numero = `55${numero}`;
    return /^55\d{10,11}$/.test(numero) ? `${numero}@s.whatsapp.net` : null;
};
const vendedorOficial = valor => VENDEDORES_OFICIAIS.find(nome => chave(nome) === chave(valor));

function tagsDoCliente(id) {
    return db.prepare(`SELECT t.id,t.name,t.color FROM reactivation_tags t
        JOIN reactivation_user_tags ut ON ut.tag_id=t.id WHERE ut.user_id=? ORDER BY t.name`).all(id);
}

function clienteCompleto(id) {
    const cliente = db.prepare(`SELECT id,customer_code,company_name,name,jid,seller,last_movement_at,last_movement_value,
        accumulated_value,reactivation_status,reactivation_notes,next_contact_at,created_at FROM users WHERE id=?`).get(id);
    if (!cliente) return null;
    cliente.tags = tagsDoCliente(id);
    cliente.contacts = db.prepare("SELECT * FROM reactivation_contacts WHERE user_id=? ORDER BY contacted_at DESC,id DESC").all(id);
    return cliente;
}

class ReactivationService {
    async extrairLinhasImportacao(arquivo) {
        const tabelas = await fileImportService.extrairTabelas(arquivo);
        return tabelas.flatMap(planilha => {
            const indiceCabecalho = planilha.tabela.findIndex(linha => {
                const nomes = linha.map(chave);
                return nomes.some(nome => ["codigo", "cod", "codigodocliente", "codigocliente"].includes(nome)) && nomes.includes("cliente");
            });
            if (indiceCabecalho < 0) return [];
            const cabecalhos = planilha.tabela[indiceCabecalho].map((valor, indice) => texto(valor) || `coluna_${indice + 1}`);
            return planilha.tabela.slice(indiceCabecalho + 1).map(linha => {
                const objeto = Object.fromEntries(cabecalhos.map((nome, indice) => [nome, linha[indice] ?? ""]));
                if (!cabecalho(objeto, ["Vendedor", "Responsável", "Responsavel", "Consultor"])) objeto.Vendedor = planilha.nome;
                return objeto;
            }).filter(linha => Object.values(linha).some(valor => texto(valor)));
        });
    }

    async extrairLinhasRelatorio(arquivo) {
        const tabelas = await fileImportService.extrairTabelas(arquivo);
        return tabelas.flatMap(planilha => {
            const indiceCabecalho = planilha.tabela.findIndex(linha => {
                const nomes = linha.map(chave);
                const temEmpresa = nomes.some(nome => ["razaosocial", "cliente", "empresa", "nome", "nomefantasia"].includes(nome));
                const temValor = nomes.some(nome => nome.includes("valorcomprado") || nome.includes("valornoperiodo") || nome === "valor" || nome === "total");
                return temEmpresa && temValor;
            });
            if (indiceCabecalho < 0) return [];
            const headers = planilha.tabela[indiceCabecalho].map((value, index) => texto(value) || `coluna_${index + 1}`);
            return planilha.tabela.slice(indiceCabecalho + 1).map(row => Object.fromEntries(headers.map((name, index) => [name, row[index] ?? ""])))
                .filter(row => Object.values(row).some(value => texto(value)));
        });
    }

    listar({ seller = "todos", status = "todos", search = "", sort = "recent", direction = "desc", tags = "" } = {}) {
        const filtros = [];
        const params = [];
        if (seller && seller !== "todos") {
            if (seller === "outros") {
                filtros.push(`COALESCE(seller,'') <> '' AND lower(seller) NOT IN (${VENDEDORES_OFICIAIS.map(() => "lower(?)").join(",")})`);
                params.push(...VENDEDORES_OFICIAIS);
            } else if (seller === "sem-vendedor") {
                filtros.push("COALESCE(TRIM(seller),'') = ''");
            } else { filtros.push("lower(seller)=lower(?)"); params.push(seller); }
        }
        if (status && status !== "todos") { filtros.push("reactivation_status=?"); params.push(status); }
        if (search) { filtros.push("(customer_code LIKE ? OR company_name LIKE ? OR name LIKE ? OR jid LIKE ?)"); params.push(...Array(4).fill(`%${search}%`)); }
        if (tags === "none") filtros.push("NOT EXISTS (SELECT 1 FROM reactivation_user_tags filter_tags WHERE filter_tags.user_id=users.id)");
        else if (tags) {
            const tagIds = [...new Set(String(tags).split(",").map(Number).filter(Number.isInteger))];
            if (tagIds.length) {
                filtros.push(`EXISTS (SELECT 1 FROM reactivation_user_tags filter_tags WHERE filter_tags.user_id=users.id AND filter_tags.tag_id IN (${tagIds.map(() => "?").join(",")}))`);
                params.push(...tagIds);
            }
        }
        const where = filtros.length ? `WHERE ${filtros.join(" AND ")}` : "";
        const ordenacoes = {
            recent: "COALESCE(reactivation_sequence,0)", code: "customer_code", client: "COALESCE(NULLIF(company_name,''),name)",
            phone: "jid", seller: "seller", movement: "last_movement_at", lastValue: "last_movement_value",
            accumulated: "accumulated_value", status: "reactivation_status", nextContact: "next_contact_at"
        };
        const coluna = ordenacoes[sort] || ordenacoes.recent;
        const sentido = String(direction).toLowerCase() === "asc" ? "ASC" : "DESC";
        return db.prepare(`SELECT id,customer_code,company_name,name,jid,seller,last_movement_at,last_movement_value,
            accumulated_value,reactivation_status,reactivation_notes,next_contact_at,created_at FROM users ${where}
            ORDER BY ${coluna} ${sentido},created_at DESC,id DESC`).all(...params)
            .map(cliente => ({ ...cliente, tags: tagsDoCliente(cliente.id) }));
    }

    obter(id) { return clienteCompleto(id); }

    salvar(id, dados) {
        const codigo = texto(dados.customer_code);
        const nome = texto(dados.name);
        const empresa = texto(dados.company_name);
        if (!codigo) throw new Error("Código do cliente é obrigatório.");
        if (!nome && !empresa) throw new Error("Informe o cliente.");
        if (dados.reactivation_status && !STATUS_REATIVACAO.includes(dados.reactivation_status)) throw new Error("Status inválido.");
        const jid = telefoneJid(dados.telefone || dados.jid);
        const executar = db.transaction(() => {
            let clienteId = Number(id) || null;
            if (clienteId) {
                const existe = db.prepare("SELECT id FROM users WHERE id=?").get(clienteId);
                if (!existe) throw new Error("Cliente não encontrado.");
                db.prepare(`UPDATE users SET customer_code=?,company_name=?,name=?,jid=?,seller=?,last_movement_at=?,last_movement_value=?,
                    accumulated_value=?,reactivation_status=?,reactivation_notes=?,next_contact_at=?,reactivation_updated_at=CURRENT_TIMESTAMP,
                    reactivation_sequence=COALESCE((SELECT MAX(reactivation_sequence)+1 FROM users),1) WHERE id=?`).run(
                    codigo, empresa || null, nome || null, jid, texto(dados.seller) || null, dataIso(dados.last_movement_at),
                    dinheiro(dados.last_movement_value), dinheiro(dados.accumulated_value), dados.reactivation_status || "Sem Contato",
                    texto(dados.reactivation_notes) || null, dataIso(dados.next_contact_at), clienteId);
            } else {
                const resultado = db.prepare(`INSERT INTO users(customer_code,company_name,name,jid,seller,last_movement_at,last_movement_value,
                    accumulated_value,reactivation_status,reactivation_notes,next_contact_at,reactivation_updated_at,reactivation_sequence)
                    VALUES(?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,COALESCE((SELECT MAX(reactivation_sequence)+1 FROM users),1))`).run(
                    codigo, empresa || null, nome || null, jid, texto(dados.seller) || null, dataIso(dados.last_movement_at),
                    dinheiro(dados.last_movement_value), dinheiro(dados.accumulated_value), dados.reactivation_status || "Sem Contato",
                    texto(dados.reactivation_notes) || null, dataIso(dados.next_contact_at));
                clienteId = Number(resultado.lastInsertRowid);
            }
            db.prepare("DELETE FROM reactivation_user_tags WHERE user_id=?").run(clienteId);
            const ids = Array.isArray(dados.tag_ids) ? [...new Set(dados.tag_ids.map(Number).filter(Boolean))] : [];
            const vincular = db.prepare("INSERT OR IGNORE INTO reactivation_user_tags(user_id,tag_id) VALUES(?,?)");
            ids.forEach(tagId => vincular.run(clienteId, tagId));
            return clienteCompleto(clienteId);
        });
        try { return executar(); } catch (erro) {
            if (erro.code === "SQLITE_CONSTRAINT_UNIQUE") throw new Error("Código ou telefone já cadastrado.");
            throw erro;
        }
    }

    atualizarStatus(id, status) {
        if (!STATUS_REATIVACAO.includes(status)) throw new Error("Status inválido.");
        if (!db.prepare("UPDATE users SET reactivation_status=?,reactivation_updated_at=CURRENT_TIMESTAMP,reactivation_sequence=COALESCE((SELECT MAX(reactivation_sequence)+1 FROM users),1) WHERE id=?").run(status, id).changes) throw new Error("Cliente não encontrado.");
        return clienteCompleto(id);
    }

    registrarContato(id, dados) {
        if (!db.prepare("SELECT id FROM users WHERE id=?").get(id)) throw new Error("Cliente não encontrado.");
        const proximo = dataIso(dados.next_contact_at);
        const resultado = db.prepare(`INSERT INTO reactivation_contacts(user_id,kind,notes,contacted_at,next_contact_at)
            VALUES(?,?,?,?,?)`).run(id, texto(dados.kind) || "ligacao", texto(dados.notes) || null, dados.contacted_at || new Date().toISOString(), proximo);
        db.prepare("UPDATE users SET next_contact_at=COALESCE(?,next_contact_at),reactivation_updated_at=CURRENT_TIMESTAMP,reactivation_sequence=COALESCE((SELECT MAX(reactivation_sequence)+1 FROM users),1) WHERE id=?").run(proximo, id);
        return db.prepare("SELECT * FROM reactivation_contacts WHERE id=?").get(resultado.lastInsertRowid);
    }

    listarTags() { return db.prepare("SELECT id,name,color FROM reactivation_tags ORDER BY name").all(); }
    criarTag(dados) {
        const name = texto(dados.name);
        if (!name) throw new Error("Informe o nome da etiqueta.");
        const resultado = db.prepare("INSERT INTO reactivation_tags(name,color) VALUES(?,?)").run(name, texto(dados.color) || "#198754");
        return db.prepare("SELECT id,name,color FROM reactivation_tags WHERE id=?").get(resultado.lastInsertRowid);
    }

    atualizarResumoRelatorio(reportId) {
        const totals = db.prepare(`SELECT COUNT(*) total,
            SUM(CASE WHEN status='pendente' THEN 1 ELSE 0 END) pending,
            SUM(CASE WHEN status='aprovado' THEN 1 ELSE 0 END) approved,
            SUM(CASE WHEN status='excluido' THEN 1 ELSE 0 END) excluded,
            COALESCE(SUM(CASE WHEN status<>'excluido' THEN purchased_value ELSE 0 END),0) value
            FROM reactivation_report_rows WHERE report_id=?`).get(reportId);
        db.prepare(`UPDATE reactivation_report_imports SET total_rows=?,pending_rows=?,approved_rows=?,excluded_rows=?,total_value=? WHERE id=?`)
            .run(totals.total || 0, totals.pending || 0, totals.approved || 0, totals.excluded || 0, totals.value || 0, reportId);
    }

    listarRelatorios() {
        return db.prepare("SELECT * FROM reactivation_report_imports ORDER BY created_at DESC,id DESC").all();
    }

    listarLinhasRelatorio(reportId, status = "todos") {
        if (!db.prepare("SELECT id FROM reactivation_report_imports WHERE id=?").get(reportId)) throw new Error("Relatório não encontrado.");
        const rows = db.prepare(`SELECT r.*,u.customer_code approved_customer_code,u.company_name approved_company
            FROM reactivation_report_rows r LEFT JOIN users u ON u.id=r.approved_user_id
            WHERE r.report_id=? ${status !== "todos" ? "AND r.status=?" : ""} ORDER BY r.id`).all(...(status !== "todos" ? [reportId, status] : [reportId]));
        const clients = db.prepare("SELECT id,customer_code,company_name FROM users").all();
        return rows.map(row => {
            const match = clients.find(client => chave(client.company_name) === chave(row.company_name));
            return { ...row, possible_match: match || null };
        });
    }

    async importarRelatorio(arquivo) {
        const linhas = await this.extrairLinhasRelatorio(arquivo);
        const mapped = linhas.map(linha => ({
            company_name: texto(cabecalho(linha, ["Razão Social", "Razao Social", "Cliente", "Empresa", "Nome", "Nome Fantasia"])),
            purchased_value: dinheiro(cabecalho(linha, ["Valor Comprado no Período", "Valor Comprado no Periodo", "Valor Comprado", "Valor no Período", "Valor no Periodo", "Total Comprado", "Valor", "Total"]))
        })).filter(item => item.company_name && item.purchased_value >= 0);
        if (!mapped.length) throw new Error("Nenhuma linha com razão social e valor comprado foi encontrada.");
        const create = db.transaction(() => {
            const reportId = Number(db.prepare("INSERT INTO reactivation_report_imports(filename) VALUES(?)").run(arquivo.filename || "relatorio").lastInsertRowid);
            const insert = db.prepare("INSERT INTO reactivation_report_rows(report_id,company_name,purchased_value) VALUES(?,?,?)");
            mapped.forEach(item => insert.run(reportId, item.company_name, item.purchased_value));
            this.atualizarResumoRelatorio(reportId);
            return reportId;
        });
        const id = create();
        return { report: db.prepare("SELECT * FROM reactivation_report_imports WHERE id=?").get(id), rows: this.listarLinhasRelatorio(id) };
    }

    editarLinhaRelatorio(rowId, dados) {
        const row = db.prepare("SELECT * FROM reactivation_report_rows WHERE id=?").get(rowId);
        if (!row) throw new Error("Cliente do relatório não encontrado.");
        if (row.status !== "pendente") throw new Error("Somente clientes pendentes podem ser editados.");
        const company = texto(dados.company_name);
        if (!company) throw new Error("Informe a razão social.");
        db.prepare("UPDATE reactivation_report_rows SET company_name=?,purchased_value=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
            .run(company, dinheiro(dados.purchased_value), rowId);
        this.atualizarResumoRelatorio(row.report_id);
        return db.prepare("SELECT * FROM reactivation_report_rows WHERE id=?").get(rowId);
    }

    excluirLinhaRelatorio(rowId) {
        const row = db.prepare("SELECT * FROM reactivation_report_rows WHERE id=?").get(rowId);
        if (!row) throw new Error("Cliente do relatório não encontrado.");
        if (row.status === "aprovado") throw new Error("Um cliente aprovado não pode ser excluído do relatório.");
        db.prepare("UPDATE reactivation_report_rows SET status='excluido',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(rowId);
        this.atualizarResumoRelatorio(row.report_id);
        return { success: true };
    }

    aprovarLinhaRelatorio(rowId, dados) {
        const row = db.prepare("SELECT * FROM reactivation_report_rows WHERE id=?").get(rowId);
        if (!row) throw new Error("Cliente do relatório não encontrado.");
        if (row.status !== "pendente") throw new Error("Este cliente não está pendente de aprovação.");
        const code = texto(dados.customer_code);
        if (!code) throw new Error("O Código OG1 é obrigatório para aprovar.");
        const existing = db.prepare("SELECT id FROM users WHERE customer_code=?").get(code);
        const current = existing ? clienteCompleto(existing.id) : null;
        const payload = {
            ...(current || {}),
            ...dados,
            customer_code: code,
            company_name: texto(dados.company_name) || row.company_name,
            last_movement_value: dados.last_movement_value ?? row.purchased_value,
            accumulated_value: dados.accumulated_value ?? row.purchased_value,
            tag_ids: dados.tag_ids || current?.tags?.map(tag => tag.id) || []
        };
        const approved = this.salvar(existing?.id || null, payload);
        db.prepare(`UPDATE reactivation_report_rows SET status='aprovado',approved_user_id=?,company_name=?,purchased_value=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
            .run(approved.id, payload.company_name, row.purchased_value, rowId);
        this.atualizarResumoRelatorio(row.report_id);
        return approved;
    }

    dashboard() {
        const total = db.prepare("SELECT COUNT(*) total FROM users WHERE customer_code IS NOT NULL AND customer_code<>''").get().total;
        const porVendedor = db.prepare("SELECT COALESCE(NULLIF(seller,''),'Sem vendedor') label,COUNT(*) total FROM users WHERE customer_code IS NOT NULL AND customer_code<>'' GROUP BY seller ORDER BY total DESC").all();
        const porStatus = db.prepare("SELECT reactivation_status label,COUNT(*) total FROM users WHERE customer_code IS NOT NULL AND customer_code<>'' GROUP BY reactivation_status ORDER BY total DESC").all();
        const contatos = db.prepare(`SELECT COUNT(*) total,SUM(CASE WHEN date(contacted_at)=date('now','localtime') THEN 1 ELSE 0 END) hoje,
            SUM(CASE WHEN date(contacted_at)>=date('now','localtime','-6 days') THEN 1 ELSE 0 END) semana FROM reactivation_contacts`).get();
        const prioritarios = db.prepare(`SELECT id,customer_code,COALESCE(NULLIF(company_name,''),name) customer,seller,last_movement_at,accumulated_value,
            CAST(julianday('now')-julianday(last_movement_at) AS INTEGER) days_without_purchase,
            ROUND((MAX(julianday('now')-julianday(last_movement_at),0)/30.0)*log10(MAX(accumulated_value,1)+1),2) priority_score
            FROM users WHERE customer_code IS NOT NULL AND customer_code<>'' AND last_movement_at IS NOT NULL
            ORDER BY priority_score DESC LIMIT 10`).all();
        return { total, porVendedor, porStatus, contatos: { total: contatos.total || 0, hoje: contatos.hoje || 0, semana: contatos.semana || 0 }, prioritarios };
    }

    async preverImportacao(arquivo) {
        const linhas = await this.extrairLinhasImportacao(arquivo);
        const vistos = new Set();
        const amostra = [];
        let novos = 0, atualizacoes = 0, invalidos = 0, duplicadosArquivo = 0;
        for (const linha of linhas) {
            const registro = this.mapearLinha(linha);
            let acao = "novo";
            if (!registro.customer_code) { invalidos += 1; acao = "inválido"; }
            else if (vistos.has(registro.customer_code)) { duplicadosArquivo += 1; acao = "duplicado no arquivo"; }
            else if (db.prepare("SELECT id FROM users WHERE customer_code=?").get(registro.customer_code)) { atualizacoes += 1; acao = "atualizar"; }
            else novos += 1;
            vistos.add(registro.customer_code);
            if (amostra.length < 20) amostra.push({ ...registro, acao });
        }
        return { total: linhas.length, novos, atualizacoes, invalidos, duplicadosArquivo, amostra };
    }

    mapearLinha(linha) {
        const seller = texto(cabecalho(linha, ["Vendedor", "Responsável", "Responsavel", "Consultor"]));
        return {
            customer_code: texto(cabecalho(linha, ["Código", "Codigo", "Código Cliente", "Código do Cliente", "Codigo do Cliente", "Cod Cliente", "Cod.", "Cliente Código"])).replace(/^[-–—]$/, ""),
            company_name: texto(cabecalho(linha, ["Cliente", "Empresa", "Razão Social", "Razao Social", "Nome Fantasia"])),
            name: cleanCustomerName(cabecalho(linha, ["Nome", "Contato"])),
            telefone: texto(cabecalho(linha, ["Telefone", "WhatsApp", "Celular", "Fone"])),
            seller: vendedorOficial(seller) || seller,
            last_movement_at: dataIso(cabecalho(linha, ["Última Movimentação", "Ultima Movimentacao", "Última Compra", "Data Última Compra", "Data Ultima Compra"])),
            last_movement_value: dinheiro(cabecalho(linha, ["Valor Última Movimentação", "Valor Ultima Movimentacao", "Valor Última Compra", "Valor Ultima Compra"])),
            accumulated_value: dinheiro(cabecalho(linha, ["Valor Acumulado", "Total Comprado", "Valor Total", "Acumulado", "Valor"]))
            ,reactivation_status: STATUS_REATIVACAO.find(status => chave(status) === chave(cabecalho(linha, ["Status"]))) || "Sem Contato"
        };
    }

    async importar(arquivo) {
        const linhas = await this.extrairLinhasImportacao(arquivo);
        const vistos = new Set();
        let novos = 0, atualizados = 0, invalidos = 0, duplicadosArquivo = 0;
        const executar = db.transaction(registros => {
            for (const linha of registros) {
                const item = this.mapearLinha(linha);
                if (!item.customer_code) { invalidos += 1; continue; }
                if (vistos.has(item.customer_code)) { duplicadosArquivo += 1; continue; }
                vistos.add(item.customer_code);
                const existente = db.prepare("SELECT id,jid FROM users WHERE customer_code=?").get(item.customer_code);
                const jid = telefoneJid(item.telefone);
                if (existente) {
                    db.prepare(`UPDATE users SET company_name=COALESCE(NULLIF(?,''),company_name),name=COALESCE(NULLIF(?,''),name),jid=COALESCE(?,jid),seller=?,last_movement_at=?,
                        last_movement_value=?,accumulated_value=? WHERE id=?`).run(item.company_name || null, item.name, jid, item.seller || null,
                        item.last_movement_at, item.last_movement_value, item.accumulated_value, existente.id);
                    atualizados += 1;
                } else {
                    db.prepare(`INSERT INTO users(customer_code,company_name,name,jid,seller,last_movement_at,last_movement_value,accumulated_value,reactivation_status)
                        VALUES(?,?,?,?,?,?,?,?,?)`).run(item.customer_code, item.company_name || null, item.name || null, jid, item.seller || null,
                        item.last_movement_at, item.last_movement_value, item.accumulated_value, item.reactivation_status);
                    novos += 1;
                }
            }
        });
        executar(linhas);
        return { total: linhas.length, novos, atualizados, invalidos, duplicadosArquivo };
    }
}

export default new ReactivationService();
