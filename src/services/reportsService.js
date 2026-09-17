import PDFDocument from "pdfkit";
import db from "../database/database.js";
import { resumoCliente } from "./customerAnalyticsService.js";
import settingsService from "./settingsService.js";

const texto = value => String(value ?? "").trim();
const moeda = value => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = value => value ? new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : "—";
const periodo = query => {
    const end = /^\d{4}-\d{2}-\d{2}$/.test(texto(query.end)) ? query.end : new Date().toISOString().slice(0, 10);
    const fallback = new Date(`${end}T12:00:00`); fallback.setDate(fallback.getDate() - 29);
    const start = /^\d{4}-\d{2}-\d{2}$/.test(texto(query.start)) ? query.start : fallback.toISOString().slice(0, 10);
    if (start > end) throw new Error("A data inicial não pode ser posterior à final.");
    return { start, end, seller: texto(query.seller) || "todos" };
};
const filtroVendedor = ({ seller }, column, params) => {
    if (seller !== "todos") { params.push(seller); return ` AND COALESCE(${column},'Sem vendedor')=?`; }
    return "";
};
const resumir = (valor, limite = 54) => {
    const textoLimpo = String(valor ?? "").replace(/\s+/g, " ").trim();
    return textoLimpo.length > limite ? `${textoLimpo.slice(0, limite - 1)}…` : textoLimpo || "—";
};
const tabelaPdf = (doc, cabecalhos, linhas, larguras) => {
    const inicioX = doc.page.margins.left; const fimY = doc.page.height - doc.page.margins.bottom;
    const cabecalho = () => { let x = inicioX; doc.font("Helvetica-Bold").fontSize(7); cabecalhos.forEach((texto, indice) => { doc.text(texto, x, doc.y, { width: larguras[indice], lineBreak: false }); x += larguras[indice]; }); doc.moveDown(0.6); doc.font("Helvetica"); };
    cabecalho();
    linhas.forEach(linha => { if (doc.y > fimY - 34) { doc.addPage(); cabecalho(); } let x = inicioX; const y = doc.y; doc.fontSize(7); linha.forEach((texto, indice) => { doc.text(resumir(texto), x, y, { width: larguras[indice], height: 24 }); x += larguras[indice]; }); doc.y = y + 27; });
};

class ReportsService {
    sellers() {
        return settingsService.listarVendedores();
    }

    process(query) {
        const filters = periodo(query); const params = [filters.start, filters.end];
        const sellerFilter = filtroVendedor(filters, "seller", params);
        const contacts = db.prepare(`SELECT c.id,'contato' type,c.contacted_at occurred_at,u.customer_code,COALESCE(NULLIF(u.company_name,''),u.name) customer,
            COALESCE(NULLIF(c.responsible,''),u.seller,'Sem vendedor') seller,c.kind detail,c.notes,c.result,c.resulting_status,c.next_action,c.next_contact_at,c.resulting_status current_value
            FROM reactivation_contacts c JOIN users u ON u.id=c.user_id
            WHERE date(c.contacted_at) BETWEEN date(?) AND date(?)${sellerFilter.replaceAll("seller", "COALESCE(NULLIF(c.responsible,''),u.seller)")}`).all(...params);
        const movementParams = [filters.start, filters.end];
        const movementFilter = filtroVendedor(filters, "m.seller", movementParams);
        const movements = db.prepare(`SELECT m.id,'venda' type,m.movement_date occurred_at,u.customer_code,COALESCE(NULLIF(u.company_name,''),u.name) customer,
            COALESCE(NULLIF(m.seller,''),u.seller,'Sem vendedor') seller,m.items detail,m.notes,CAST(m.value AS TEXT) current_value
            FROM customer_movements m JOIN users u ON u.id=m.user_id
            WHERE date(m.movement_date) BETWEEN date(?) AND date(?)${movementFilter}`).all(...movementParams);
        const logParams = [filters.start, filters.end];
        const logFilter = filtroVendedor(filters, "l.seller", logParams);
        const changes = db.prepare(`SELECT l.id,l.activity_type type,l.occurred_at,u.customer_code,COALESCE(NULLIF(u.company_name,''),u.name) customer,
            COALESCE(NULLIF(l.seller,''),u.seller,'Sem vendedor') seller,l.field_name detail,l.current_value
            FROM customer_activity_logs l JOIN users u ON u.id=l.user_id
            WHERE date(l.occurred_at) BETWEEN date(?) AND date(?)${logFilter}`).all(...logParams);
        const activities = [...contacts, ...movements, ...changes].sort((a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at)) || b.id - a.id);
        return { filters, activities, totals: { total: activities.length, contacts: contacts.length, sales: movements.length, changes: changes.length } };
    }

    priorities(query) {
        const filters = periodo(query); const params = []; const priority = ["Alta", "Média", "Baixa"].includes(texto(query.priority)) ? texto(query.priority) : "todos";
        const sellerFilter = filtroVendedor(filters, "u.seller", params);
        const customers = db.prepare(`SELECT u.id,u.customer_code,COALESCE(NULLIF(u.company_name,''),u.name) customer,u.seller,u.reactivation_status,u.next_contact_at,
            u.priority_override,u.priority_notes,u.last_movement_at FROM users u
            WHERE u.customer_code IS NOT NULL AND TRIM(u.customer_code)<>''${sellerFilter}`).all(...params);
        const metrics = db.prepare("SELECT * FROM customer_monthly_metrics ORDER BY user_id,period_start,id").all();
        const rows = customers.map(customer => {
            const all = metrics.filter(metric => metric.user_id === customer.id);
            const selected = all.filter(metric => metric.period_end >= filters.start && metric.period_start <= filters.end);
            const summary = resumoCliente(customer, all.filter(metric => metric.period_end <= filters.end));
            return { ...customer, priority: summary.prioridade, period_value: selected.reduce((sum, metric) => sum + Number(metric.purchased_value || 0), 0),
                period_orders: selected.reduce((sum, metric) => sum + Number(metric.order_count || 0), 0), last_purchase: summary.ultimaCompra };
        }).filter(row => priority === "todos" || row.priority.level === priority).sort((a, b) => b.priority.score - a.priority.score || b.period_value - a.period_value ||
            String(a.customer || a.customer_code || "").localeCompare(String(b.customer || b.customer_code || "")));
        return { filters: { ...filters, priority }, rows, totals: { total: rows.length, high: rows.filter(row => row.priority.level === "Alta").length,
            medium: rows.filter(row => row.priority.level === "Média").length, low: rows.filter(row => row.priority.level === "Baixa").length } };
    }

    reactivationContacts(query) {
        const process = this.process(query);
        const activities = process.activities.filter(item => item.type === "contato");
        return { ...process, title: "Relatório de contatos de reativação", activities,
            totals: { total: activities.length, contacts: activities.length } };
    }

    summary(query) {
        const process = this.process(query); const priorities = this.priorities(query);
        return { filters: process.filters, cards: [
            { id: "movimentacoes", label: "Movimentações registradas", value: process.totals.total, detail: `${process.totals.contacts} contatos, ${process.totals.sales} vendas e ${process.totals.changes} alterações` },
            { id: "prioridade-alta", label: "Clientes de prioridade alta", value: priorities.totals.high, detail: `de ${priorities.totals.total} clientes no filtro` },
            { id: "vendas", label: "Vendas no período", value: moeda(priorities.rows.reduce((sum, row) => sum + row.period_value, 0)), detail: `${priorities.rows.reduce((sum, row) => sum + row.period_orders, 0)} pedidos registrados` },
            { id: "contatos", label: "Contatos realizados", value: process.totals.contacts, detail: "registrados no período selecionado" }
        ] };
    }

    card(query) {
        const card = texto(query.card); const process = this.process(query); const priorities = this.priorities(query);
        if (card === "movimentacoes") return { ...process, title: "Movimentações registradas", rows: process.activities };
        if (card === "contatos") return { ...process, title: "Contatos realizados", rows: process.activities.filter(item => item.type === "contato") };
        if (card === "prioridade-alta") return { ...priorities, title: "Clientes de prioridade alta", rows: priorities.rows.filter(item => item.priority.level === "Alta") };
        if (card === "vendas") return { ...priorities, title: "Vendas no período", rows: priorities.rows.filter(item => item.period_value > 0) };
        throw new Error("Card de acompanhamento inválido.");
    }

    data(type, query) {
        if (type === "processo") return this.process(query);
        if (type === "contatos-reativacao") return this.reactivationContacts(query);
        if (type === "prioridades") return this.priorities(query);
        if (type === "acompanhamento") return query.card ? this.card(query) : this.summary(query);
        throw new Error("Tipo de relatório inválido.");
    }

    async pdf(type, query) {
        const report = this.data(type, query); const title = report.title || (type === "processo" ? "Relatório de movimentações" : type === "prioridades" ? "Relatório de prioridades" : "Acompanhamento comercial");
        const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 32, bufferPages: true, info: { Title: title } }); const chunks = [];
        doc.on("data", chunk => chunks.push(chunk));
        const done = new Promise((resolve, reject) => { doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
        doc.fontSize(18).text(title).moveDown(0.3); doc.fontSize(10).fillColor("#555").text(`Período: ${dataBr(report.filters.start)} a ${dataBr(report.filters.end)} • Vendedor: ${report.filters.seller === "todos" ? "Todos" : report.filters.seller}`).fillColor("black").moveDown();
        if (type === "acompanhamento" && !query.card) report.cards.forEach(card => { doc.fontSize(12).text(card.label); doc.fontSize(16).text(String(card.value)); doc.fontSize(9).fillColor("#555").text(card.detail).fillColor("black").moveDown(); });
        else if (type === "acompanhamento") report.rows.forEach(row => { const prioridade = row.priority ? `${row.priority.level} (${row.priority.score})` : row.type; doc.fontSize(10).text(`${prioridade} • ${row.customer || row.customer_code || "Cliente"}`); doc.fontSize(9).fillColor("#555").text(`${row.seller || "Sem vendedor"}${row.period_value !== undefined ? ` • ${moeda(row.period_value)}` : row.detail ? ` • ${row.detail}` : ""}`).fillColor("black").moveDown(0.5); });
        else if (type === "processo" || type === "contatos-reativacao") tabelaPdf(doc, ["Data", "Cliente / OG1", "Vendedor", "Tipo", "Descrição / observação", "Status / resultado", "Próxima ação / retorno"], report.activities.map(item => [dataBr(item.occurred_at), item.customer || item.customer_code, item.seller, item.type, item.notes || item.detail, item.resulting_status || item.result || item.current_value, [item.next_action, dataBr(item.next_contact_at)].filter(Boolean).join(" — ")]), [55, 125, 75, 55, 190, 105, 120]);
        else tabelaPdf(doc, ["Prioridade", "Score", "Cliente / OG1", "Vendedor", "Valor no período", "Pedidos", "Motivo"], report.rows.map(row => [row.priority.level, row.priority.score, row.customer || row.customer_code, row.seller, moeda(row.period_value), row.period_orders, row.priority.reason]), [65, 42, 140, 90, 95, 55, 235]);
        doc.end(); return done;
    }
}

export default new ReportsService();
