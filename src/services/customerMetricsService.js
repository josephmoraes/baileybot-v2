import db from "../database/database.js";
import fileImportService from "./fileImportService.js";

const OFICIAIS = ["Alisson", "Noberto", "Aldener", "Letícia", "Clayton"];
const texto = valor => String(valor ?? "").trim();
const chave = valor => texto(valor).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const cabecalho = (linha, nomes) => Object.entries(linha).find(([nome]) => nomes.map(chave).includes(chave(nome)))?.[1];
const dinheiro = valor => {
    if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0;
    const limpo = texto(valor).replace(/R\$/gi, "").replace(/\s/g, "");
    const numero = Number(limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo);
    return Number.isFinite(numero) ? numero : 0;
};
const vendedorOficial = valor => OFICIAIS.find(nome => chave(nome) === chave(valor)) || "Outros";
const dataBr = valor => valor ? new Date(`${valor}T12:00:00`).toLocaleDateString("pt-BR") : "";
const tipoPeriodo = ({ start, end }) => {
    const dias = Math.round((new Date(end) - new Date(start)) / 86400000) + 1;
    if (dias <= 31) return "Mensal";
    if (dias <= 100) return "Trimestral";
    if (dias <= 190) return "Semestral";
    if (dias <= 370) return "Anual";
    return "Personalizado";
};

function mapearLinha(linha) {
    const customerCode = texto(cabecalho(linha, ["Código", "Codigo", "Código Cliente", "Codigo Cliente", "Cod. Cliente"])).replace(/\s/g, "");
    if (!customerCode || /^(codigo|código)$/i.test(customerCode)) return null;
    const companyName = texto(cabecalho(linha, ["Cliente", "Nome", "Razão Social", "Razao Social", "Cliente / empresa"]));
    const reportSeller = texto(cabecalho(linha, ["Vendedor", "Responsável", "Responsavel", "Vendedor do Relatório"])) || "Não informado";
    const purchasedValue = dinheiro(cabecalho(linha, ["Valor", "Valor Comprado", "Valor Comprado no Período", "Total"]));
    const orderCount = dinheiro(cabecalho(linha, ["Quantidade", "Quantidade de Pedidos", "Pedidos", "Qtd"]));
    return { customerCode, companyName, reportSeller, seller: vendedorOficial(reportSeller), purchasedValue, orderCount };
}

function consolidar(items) {
    const mapa = new Map();
    for (const item of items) {
        const atual = mapa.get(item.customerCode) || { ...item, companyName: "", purchasedValue: 0, orderCount: 0, sellers: new Set() };
        if (!atual.companyName && item.companyName) atual.companyName = item.companyName;
        atual.purchasedValue += item.purchasedValue;
        atual.orderCount += item.orderCount;
        atual.sellers.add(item.reportSeller);
        mapa.set(item.customerCode, atual);
    }
    return [...mapa.values()].map(item => ({ customerCode: item.customerCode, companyName: item.companyName,
        reportSeller: [...item.sellers].join(", ") || "Não informado",
        seller: item.sellers.size === 1 ? vendedorOficial([...item.sellers][0]) : "Outros",
        purchasedValue: item.purchasedValue, orderCount: item.orderCount,
        averageOrderValue: item.orderCount ? item.purchasedValue / item.orderCount : 0 }));
}

function prioridade(cliente, totalA, totalB) {
    const variacao = totalA ? ((totalB - totalA) / totalA) * 100 : totalB ? 100 : null;
    let score = 20; const motivos = [];
    if (totalA > 0 && totalB === 0) { score += 60; motivos.push("comprou no período anterior e não comprou no atual"); }
    else if (variacao !== null && variacao <= -50) { score += 50; motivos.push(`queda de ${Math.abs(Math.round(variacao))}% no valor comprado`); }
    else if (variacao !== null && variacao <= -20) { score += 30; motivos.push(`queda de ${Math.abs(Math.round(variacao))}% no valor comprado`); }
    else if (variacao !== null && variacao >= 20) { score -= 10; motivos.push(`crescimento de ${Math.round(variacao)}%`); }
    if (totalA >= 5000) { score += 15; motivos.push("cliente de valor histórico relevante"); }
    if (["Entrar em contato", "Aguardando"].includes(cliente.reactivation_status)) { score += 15; motivos.push(`status ${cliente.reactivation_status}`); }
    if (cliente.next_contact_at && cliente.next_contact_at <= new Date().toISOString().slice(0, 10)) { score += 15; motivos.push("contato programado está vencido"); }
    score = Math.max(0, Math.min(100, score));
    return { level: score >= 70 ? "Alta" : score >= 40 ? "Média" : "Baixa", score, reason: motivos.join("; ") || "sem alerta relevante" };
}

class CustomerMetricsService {
    async preview(arquivo) {
        const [linhas, period] = await Promise.all([fileImportService.extrairLinhas(arquivo), fileImportService.extrairPeriodo(arquivo)]);
        if (!period) throw new Error("Não foi possível identificar o PERÍODO dentro do relatório. Confira se o arquivo mostra as datas inicial e final.");
        const items = consolidar(linhas.map(mapearLinha).filter(Boolean));
        if (!items.length) throw new Error("Nenhum cliente válido foi encontrado no relatório.");
        const existing = db.prepare("SELECT customer_code FROM users WHERE customer_code=?");
        return { period: { ...period, type: tipoPeriodo(period) }, total: items.length,
            newCustomers: items.filter(item => !existing.get(item.customerCode)).length,
            updatedCustomers: items.filter(item => existing.get(item.customerCode)).length,
            totalValue: items.reduce((sum, item) => sum + item.purchasedValue, 0), sample: items.slice(0, 8), items };
    }

    async import(arquivo) {
        const preview = await this.preview(arquivo);
        const overlap = db.prepare("SELECT id,period_start,period_end FROM customer_metric_imports WHERE period_start<=? AND period_end>=?").get(preview.period.end, preview.period.start);
        if (overlap) throw new Error(`Este período se sobrepõe ao relatório de ${dataBr(overlap.period_start)} a ${dataBr(overlap.period_end)}. Isso duplicaria vendas.`);
        return db.transaction(() => {
            const { start, end } = preview.period; const year = Number(start.slice(0, 4)); const month = Number(start.slice(5, 7));
            const importId = Number(db.prepare(`INSERT INTO customer_metric_imports(filename,reference_year,reference_month,total_rows,inserted_customers,updated_customers,total_value,period_start,period_end) VALUES(?,?,?,?,?,?,?,?,?)`)
                .run(arquivo.filename || "relatorio", year, month, preview.total, preview.newCustomers, preview.updatedCustomers, preview.totalValue, start, end).lastInsertRowid);
            const find = db.prepare("SELECT id FROM users WHERE customer_code=?");
            const create = db.prepare("INSERT INTO users(customer_code,company_name,name,jid,seller) VALUES(?,?,NULL,NULL,?)");
            const update = db.prepare("UPDATE users SET company_name=COALESCE(NULLIF(?,''),company_name),seller=CASE WHEN ?<>'Outros' THEN ? ELSE COALESCE(seller,?) END WHERE id=?");
            const metric = db.prepare(`INSERT INTO customer_monthly_metrics(user_id,import_id,reference_year,reference_month,seller,report_seller,purchased_value,order_count,average_order_value,period_start,period_end) VALUES(?,?,?,?,?,?,?,?,?,?,?)`);
            for (const item of preview.items) {
                let user = find.get(item.customerCode);
                if (!user) user = { id: Number(create.run(item.customerCode, item.companyName || null, item.seller).lastInsertRowid) };
                else update.run(item.companyName, item.seller, item.seller, item.seller, user.id);
                metric.run(user.id, importId, year, month, item.seller, item.reportSeller, item.purchasedValue, item.orderCount, item.averageOrderValue, start, end);
            }
            return { success: true, importId, ...preview, items: undefined };
        })();
    }

    imports() { return db.prepare("SELECT * FROM customer_metric_imports ORDER BY period_start DESC,id DESC").all(); }

    dashboard(query = {}) {
        const yearA = Number(query.yearA) || new Date().getFullYear() - 1;
        const yearB = Number(query.yearB) || new Date().getFullYear();
        const fromMonth = Math.min(12, Math.max(1, Number(query.fromMonth) || 1));
        const toMonth = Math.min(12, Math.max(fromMonth, Number(query.toMonth) || 12));
        const rangeA = { start: query.startA || `${yearA}-${String(fromMonth).padStart(2, "0")}-01`, end: query.endA || `${yearA}-${String(toMonth).padStart(2, "0")}-31` };
        const rangeB = { start: query.startB || `${yearB}-${String(fromMonth).padStart(2, "0")}-01`, end: query.endB || `${yearB}-${String(toMonth).padStart(2, "0")}-31` };
        const seller = texto(query.seller); const filter = seller && seller !== "todos" ? "AND m.seller=?" : "";
        const rows = db.prepare(`SELECT u.id user_id,u.customer_code,COALESCE(NULLIF(u.company_name,''),u.name) company_name,u.reactivation_status,u.next_contact_at,u.metric_status,m.*,
            CASE WHEN m.period_start>=? AND m.period_end<=? THEN 'A' ELSE 'B' END comparison_group
            FROM customer_monthly_metrics m JOIN users u ON u.id=m.user_id
            WHERE ((m.period_start>=? AND m.period_end<=?) OR (m.period_start>=? AND m.period_end<=?)) ${filter} ORDER BY u.id,m.period_start`)
            .all(rangeA.start, rangeA.end, rangeA.start, rangeA.end, rangeB.start, rangeB.end, ...(filter ? [seller] : []));
        const grouped = new Map();
        for (const row of rows) {
            if (!grouped.has(row.user_id)) grouped.set(row.user_id, { id: row.user_id, customer_code: row.customer_code, company_name: row.company_name, reactivation_status: row.reactivation_status, next_contact_at: row.next_contact_at, metric_status: row.metric_status, metrics: [] });
            grouped.get(row.user_id).metrics.push(row);
        }
        const customers = [...grouped.values()].map(customer => {
            const soma = (grupo, campo) => customer.metrics.filter(item => item.comparison_group === grupo).reduce((sum, item) => sum + item[campo], 0);
            const totalA = soma("A", "purchased_value"); const totalB = soma("B", "purchased_value");
            const ordersA = soma("A", "order_count"); const ordersB = soma("B", "order_count");
            return { ...customer, totalA, totalB, ordersA, ordersB, averageA: ordersA ? totalA / ordersA : 0, averageB: ordersB ? totalB / ordersB : 0,
                variation: totalA ? ((totalB - totalA) / totalA) * 100 : totalB ? 100 : 0, priority: prioridade(customer, totalA, totalB) };
        }).sort((a, b) => b.priority.score - a.priority.score || b.totalA - a.totalA);
        const timelineGroup = group => [...new Set(rows.filter(row => row.comparison_group === group).map(row => row.period_start))].sort()
            .map(start => ({ start, value: rows.filter(row => row.period_start === start && row.comparison_group === group).reduce((sum, row) => sum + row.purchased_value, 0) }));
        const timelineA = timelineGroup("A"); const timelineB = timelineGroup("B");
        const timeline = Array.from({ length: Math.max(timelineA.length, timelineB.length) }, (_, index) => ({
            label: timelineB[index]?.start ? dataBr(timelineB[index].start).slice(0, 5) : dataBr(timelineA[index]?.start).slice(0, 5),
            valueA: timelineA[index]?.value || 0, valueB: timelineB[index]?.value || 0
        }));
        return { yearA, yearB, rangeA, rangeB, sellers: [...new Set(rows.map(row => row.seller))].sort(), customers, timeline };
    }

    customer(id) {
        const customer = db.prepare(`SELECT id,customer_code,company_name,name,jid,seller,last_movement_at,last_movement_value,accumulated_value,reactivation_status,reactivation_notes,next_contact_at,main_products,latest_products,metric_status,metric_notes,created_at FROM users WHERE id=?`).get(id);
        if (!customer) throw new Error("Cliente não encontrado.");
        customer.metrics = db.prepare("SELECT * FROM customer_monthly_metrics WHERE user_id=? ORDER BY period_start,id").all(id);
        customer.status_options = this.statusOptions("metrics");
        const years = [...new Set(customer.metrics.map(item => item.reference_year))].sort((a, b) => b - a);
        const totalB = customer.metrics.filter(item => item.reference_year === years[0]).reduce((sum, item) => sum + item.purchased_value, 0);
        const totalA = customer.metrics.filter(item => item.reference_year === years[1]).reduce((sum, item) => sum + item.purchased_value, 0);
        customer.priority = prioridade(customer, totalA, totalB);
        return customer;
    }

    updateCustomer(id, data) {
        const current = db.prepare("SELECT main_products,latest_products,metric_status,metric_notes FROM users WHERE id=?").get(id);
        if (!current) throw new Error("Cliente não encontrado.");
        if (data.metric_status && !this.statusOptions("metrics").some(item => item.name === data.metric_status)) throw new Error("Status de métricas inválido.");
        db.prepare("UPDATE users SET main_products=?,latest_products=?,metric_status=?,metric_notes=? WHERE id=?")
            .run(data.main_products === undefined ? current.main_products : texto(data.main_products) || null,
                data.latest_products === undefined ? current.latest_products : texto(data.latest_products) || null,
                data.metric_status === undefined ? current.metric_status : texto(data.metric_status) || "Pendente de contato",
                data.metric_notes === undefined ? current.metric_notes : texto(data.metric_notes) || null, id);
        return this.customer(id);
    }
    updateProducts(id, data) { return this.updateCustomer(id, { ...this.customer(id), ...data }); }

    statusOptions(scope) { return db.prepare("SELECT id,scope,name,color,active,position FROM customer_status_options WHERE scope=? AND active=1 ORDER BY position,name").all(scope); }
    createStatus(data) {
        const scope = ["metrics", "reactivation"].includes(data.scope) ? data.scope : null;
        if (!scope || !texto(data.name)) throw new Error("Informe o tipo e o nome do status.");
        const result = db.prepare("INSERT INTO customer_status_options(scope,name,color,position) VALUES(?,?,?,COALESCE((SELECT MAX(position)+1 FROM customer_status_options WHERE scope=?),0))")
            .run(scope, texto(data.name), /^#[0-9a-f]{6}$/i.test(data.color) ? data.color : "#6c757d", scope);
        return db.prepare("SELECT * FROM customer_status_options WHERE id=?").get(result.lastInsertRowid);
    }
    deleteStatus(id) {
        const option = db.prepare("SELECT * FROM customer_status_options WHERE id=?").get(id);
        if (!option) throw new Error("Status não encontrado.");
        const field = option.scope === "metrics" ? "metric_status" : "reactivation_status";
        if (db.prepare(`SELECT id FROM users WHERE ${field}=? LIMIT 1`).get(option.name)) throw new Error("Este status está em uso. Altere os clientes antes de removê-lo.");
        db.prepare("DELETE FROM customer_status_options WHERE id=?").run(id);
        return { success: true };
    }
}

export default new CustomerMetricsService();
