import db from "../database/database.js";
import fileImportService from "./fileImportService.js";
import customerService from "./customerService.js";
import importHistoryService from "./importHistoryService.js";
import settingsService from "./settingsService.js";
import { calcularPrioridade as prioridade, calcularScoreReativacao, periodosEfetivos, resumoCliente } from "./customerAnalyticsService.js";
import { STATUS_REATIVACAO } from "./reactivationService.js";

const texto = valor => String(valor ?? "").trim();
const chave = valor => texto(valor).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const cabecalho = (linha, nomes) => Object.entries(linha).find(([nome]) => nomes.map(chave).includes(chave(nome)))?.[1];
const dinheiro = valor => {
    if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0;
    const limpo = texto(valor).replace(/R\$/gi, "").replace(/\s/g, "");
    const numero = Number(limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo);
    return Number.isFinite(numero) ? numero : 0;
};
const vendedorOficial = valor => settingsService.normalizarVendedor(valor);
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
    const movementNumber = texto(cabecalho(linha, ["Número do Movimento", "Numero do Movimento", "Movimento", "Número Movimento", "Numero Movimento"]));
    return { customerCode, companyName, reportSeller, seller: vendedorOficial(reportSeller), purchasedValue, orderCount, movementNumber };
}

function consolidar(items) {
    const mapa = new Map();
    for (const item of items) {
        const atual = mapa.get(item.customerCode) || { ...item, companyName: "", purchasedValue: 0, orderCount: 0, sellers: new Set(), movements: new Set() };
        if (!atual.companyName && item.companyName) atual.companyName = item.companyName;
        atual.purchasedValue += item.purchasedValue;
        atual.orderCount += item.orderCount;
        atual.sellers.add(item.reportSeller);
        if (item.movementNumber) atual.movements.add(item.movementNumber);
        mapa.set(item.customerCode, atual);
    }
    return [...mapa.values()].map(item => ({ customerCode: item.customerCode, companyName: item.companyName,
        reportSeller: [...item.sellers].join(", ") || "Não informado",
        seller: item.sellers.size === 1 ? vendedorOficial([...item.sellers][0]) : "Outros",
        purchasedValue: item.purchasedValue, orderCount: item.orderCount,
        averageOrderValue: item.orderCount ? item.purchasedValue / item.orderCount : 0,
        movementNumbers: [...item.movements].join(", ") || null }));
}

class CustomerMetricsService {
    async preview(arquivo) {
        const [linhas, period] = await Promise.all([fileImportService.extrairLinhas(arquivo), fileImportService.extrairPeriodo(arquivo)]);
        if (!period) throw new Error("Não foi possível identificar o PERÍODO dentro do relatório. Confira se o arquivo mostra as datas inicial e final.");
        const mapeadas = linhas.map((linha, index) => ({ ...mapearLinha(linha), rowNumber: index + 2, rawData: linha }));
        const usaMovimentos = mapeadas.some(item => item.movementNumber);
        const movimentosArquivo = new Set();
        const movimentoExistente = db.prepare("SELECT 1 FROM customer_movements WHERE UPPER(TRIM(movement_number))=UPPER(TRIM(?))");
        const validationErrors = [];
        const validas = [];
        let duplicateMovements = 0;
        for (const item of mapeadas) {
            const erros = [];
            if (!item.customerCode) erros.push("Código OG1 é obrigatório.");
            if (!item.reportSeller || item.reportSeller === "Não informado") erros.push("Vendedor é obrigatório.");
            if (!Number.isFinite(item.purchasedValue) || item.purchasedValue < 0) erros.push("Valor é inválido.");
            if (usaMovimentos && !item.movementNumber) erros.push("Número do movimento é obrigatório.");
            const movimento = chave(item.movementNumber);
            if (movimento && (movimentosArquivo.has(movimento) || movimentoExistente.get(item.movementNumber))) {
                duplicateMovements += 1;
                continue;
            }
            if (movimento) movimentosArquivo.add(movimento);
            if (erros.length) validationErrors.push({ rowNumber: item.rowNumber, customerCode: item.customerCode,
                movementNumber: item.movementNumber, error: erros.join(" "), rawData: item.rawData });
            else validas.push(item);
        }
        const items = consolidar(validas);
        if (!mapeadas.length) throw new Error("Nenhuma linha foi encontrada no relatório.");
        const existing = db.prepare("SELECT customer_code FROM users WHERE customer_code=?");
        const duplicate = db.prepare(`SELECT 1 FROM customer_monthly_metrics m JOIN users u ON u.id=m.user_id
            WHERE u.customer_code=? AND m.period_start=? AND m.period_end=?`);
        const duplicateCustomers = items.filter(item => duplicate.get(item.customerCode, period.start, period.end)).length;
        return { period: { ...period, type: tipoPeriodo(period) }, total: items.length,
            newCustomers: items.filter(item => !existing.get(item.customerCode)).length,
            updatedCustomers: items.filter(item => existing.get(item.customerCode)).length,
            duplicateCustomers, importableCustomers: items.length - duplicateCustomers,
            totalValue: items.reduce((sum, item) => sum + item.purchasedValue, 0), sample: items.slice(0, 8), items,
            sourceRows: linhas.length, invalidRows: validationErrors.length, duplicateMovements, validationErrors };
    }

    async import(arquivo) {
        const preview = await this.preview(arquivo);
        const historyId = importHistoryService.iniciar({ module: "metricas", filename: arquivo.filename,
            importedBy: arquivo.importedBy || arquivo.user, totalRows: preview.sourceRows });
        preview.validationErrors.forEach(error => importHistoryService.erro(historyId, error));
        return db.transaction(() => {
            const { start, end } = preview.period; const year = Number(start.slice(0, 4)); const month = Number(start.slice(5, 7));
            const existingMetric = db.prepare("SELECT id,import_id,manual_only,purchased_value,order_count,movement_numbers FROM customer_monthly_metrics WHERE user_id=? AND period_start=? AND period_end=?");
            const pending = [];
            let createdCustomers = 0; let updatedCustomers = 0;
            for (const item of preview.items) {
                const upsert = customerService.upsertPorCodigo({ customer_code: item.customerCode,
                    company_name: item.companyName, seller: item.seller === "Outros" ? "" : item.seller });
                const user = upsert.customer;
                if (upsert.created) createdCustomers += 1; else updatedCustomers += 1;
                const duplicate = existingMetric.get(user.id, start, end);
                if (!duplicate || Number(duplicate.manual_only)) pending.push({ item, user, manualMetric: duplicate || null });
            }
            if (!pending.length) {
                const history = importHistoryService.concluir(historyId, { totalRows: preview.sourceRows,
                    ignoredRows: preview.sourceRows, duplicateRows: preview.total + preview.duplicateMovements,
                    createdCustomers, updatedCustomers, errorRows: preview.invalidRows });
                return { success: true, importId: null, historyId, history, ...preview, items: undefined,
                    validationErrors: undefined, importedMetrics: 0, duplicateCustomers: preview.total, ignoredDuplicates: preview.total + preview.duplicateMovements };
            }
            const totalValue = pending.reduce((sum, entry) => sum + entry.item.purchasedValue, 0);
            const importId = Number(db.prepare(`INSERT INTO customer_metric_imports(filename,reference_year,reference_month,total_rows,inserted_customers,updated_customers,total_value,period_start,period_end) VALUES(?,?,?,?,?,?,?,?,?)`)
                .run(arquivo.filename || "relatorio", year, month, preview.total, preview.newCustomers, preview.updatedCustomers, totalValue, start, end).lastInsertRowid);
            const metric = db.prepare(`INSERT INTO customer_monthly_metrics(user_id,import_id,reference_year,reference_month,seller,report_seller,purchased_value,order_count,average_order_value,period_start,period_end,movement_numbers,manual_only) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,0)`);
            const mergeManualMetric = db.prepare(`UPDATE customer_monthly_metrics SET import_id=?,seller=?,report_seller=?,purchased_value=?,order_count=?,average_order_value=?,movement_numbers=?,manual_only=0,updated_at=CURRENT_TIMESTAMP WHERE id=?`);
            const movement = db.prepare(`INSERT OR IGNORE INTO customer_movements
                (user_id,import_history_id,movement_number,movement_date,seller,value,source_module) VALUES(?,?,?,?,?,?,'metricas')`);
            const confirmarReativacao = db.prepare(`UPDATE users SET reactivation_status='Reativado',reactivated_at=?,
                reactivation_source_import_id=?,reactivation_updated_at=CURRENT_TIMESTAMP
                WHERE id=? AND reactivation_status IN ('Entrar em contato','Contatado','Aguardando retorno','Negociação')`);
            const eventoReativacao = db.prepare(`INSERT OR IGNORE INTO reactivation_events
                (user_id,import_id,previous_status,confirmed_at,purchased_value) VALUES(?,?,?,?,?)`);
            for (const { item, user, manualMetric } of pending) {
                const previous = db.prepare("SELECT reactivation_status,reactivation_updated_at FROM users WHERE id=?").get(user.id);
                if (manualMetric) {
                    const value = Number(manualMetric.purchased_value || 0) + item.purchasedValue;
                    const orders = Number(manualMetric.order_count || 0) + item.orderCount;
                    const movements = [manualMetric.movement_numbers, item.movementNumbers].filter(Boolean).join(",");
                    mergeManualMetric.run(importId, item.seller, item.reportSeller, value, orders, orders ? value / orders : 0, movements, manualMetric.id);
                } else metric.run(user.id, importId, year, month, item.seller, item.reportSeller, item.purchasedValue, item.orderCount, item.averageOrderValue, start, end, item.movementNumbers);
                String(item.movementNumbers || "").split(",").map(texto).filter(Boolean)
                    .forEach(number => movement.run(user.id, historyId, number, end, item.reportSeller, item.purchasedValue));
                const iniciouAntesDoPeriodo = !previous.reactivation_updated_at || end >= String(previous.reactivation_updated_at).slice(0, 10);
                if (item.purchasedValue > 0 && iniciouAntesDoPeriodo && confirmarReativacao.run(end, importId, user.id).changes) {
                    eventoReativacao.run(user.id, importId, previous.reactivation_status, end, item.purchasedValue);
                }
            }
            const history = importHistoryService.concluir(historyId, { totalRows: preview.sourceRows,
                importedRows: pending.length, ignoredRows: preview.sourceRows - pending.length,
                duplicateRows: preview.total - pending.length + preview.duplicateMovements,
                createdCustomers, updatedCustomers, errorRows: preview.invalidRows });
            return { success: true, importId, historyId, history, ...preview, items: undefined, validationErrors: undefined, totalValue,
                importedMetrics: pending.length, duplicateCustomers: preview.total - pending.length,
                ignoredDuplicates: preview.total - pending.length + preview.duplicateMovements };
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
        const rows = db.prepare(`SELECT u.id user_id,u.customer_code,COALESCE(NULLIF(u.company_name,''),u.name) company_name,u.seller customer_seller,
            u.reactivation_status,u.next_contact_at,u.inactivity_reason,u.reactivated_at,u.metric_status,u.priority_override,u.priority_notes,m.*,
            CASE WHEN m.period_start>=? AND m.period_end<=? THEN 'A' ELSE 'B' END comparison_group
            FROM customer_monthly_metrics m JOIN users u ON u.id=m.user_id
            WHERE ((m.period_start>=? AND m.period_end<=?) OR (m.period_start>=? AND m.period_end<=?)) ${filter} ORDER BY u.id,m.period_start`)
            .all(rangeA.start, rangeA.end, rangeA.start, rangeA.end, rangeB.start, rangeB.end, ...(filter ? [seller] : []));
        const effectiveRows = [...new Set(rows.map(row => `${row.user_id}:${row.comparison_group}`))]
            .flatMap(key => {
                const [userId, group] = key.split(":");
                return periodosEfetivos(rows.filter(row => String(row.user_id) === userId && row.comparison_group === group));
            });
        const grouped = new Map();
        for (const row of effectiveRows) {
            if (!grouped.has(row.user_id)) grouped.set(row.user_id, { id: row.user_id, customer_code: row.customer_code, company_name: row.company_name, seller: row.customer_seller, reactivation_status: row.reactivation_status, next_contact_at: row.next_contact_at, inactivity_reason: row.inactivity_reason, reactivated_at: row.reactivated_at, metric_status: row.metric_status, priority_override: row.priority_override, priority_notes: row.priority_notes, metrics: [] });
            grouped.get(row.user_id).metrics.push(row);
        }
        const customers = [...grouped.values()].map(customer => {
            const soma = (grupo, campo) => customer.metrics.filter(item => item.comparison_group === grupo).reduce((sum, item) => sum + item[campo], 0);
            const totalA = soma("A", "purchased_value"); const totalB = soma("B", "purchased_value");
            const ordersA = soma("A", "order_count"); const ordersB = soma("B", "order_count");
            const contacts = db.prepare("SELECT * FROM reactivation_contacts WHERE user_id=? ORDER BY contacted_at DESC,id DESC").all(customer.id);
            return { ...customer, totalA, totalB, ordersA, ordersB, averageA: ordersA ? totalA / ordersA : 0, averageB: ordersB ? totalB / ordersB : 0,
                variation: totalA ? ((totalB - totalA) / totalA) * 100 : totalB ? 100 : 0,
                reactivation_result: customer.reactivated_at ? customer.metrics.filter(item => item.period_end >= customer.reactivated_at).reduce((sum, item) => sum + item.purchased_value, 0) : 0,
                priority: prioridade(customer, totalA, totalB, customer.metrics),
                reactivation_score: calcularScoreReativacao(customer, customer.metrics, contacts) };
        }).sort((a, b) => b.priority.score - a.priority.score || b.totalA - a.totalA);
        const timelineGroup = group => [...new Set(effectiveRows.filter(row => row.comparison_group === group).map(row => row.period_start))].sort()
            .map(start => ({ start, value: effectiveRows.filter(row => row.period_start === start && row.comparison_group === group).reduce((sum, row) => sum + row.purchased_value, 0) }));
        const timelineA = timelineGroup("A"); const timelineB = timelineGroup("B");
        const timeline = Array.from({ length: Math.max(timelineA.length, timelineB.length) }, (_, index) => ({
            label: timelineB[index]?.start ? dataBr(timelineB[index].start).slice(0, 5) : dataBr(timelineA[index]?.start).slice(0, 5),
            valueA: timelineA[index]?.value || 0, valueB: timelineB[index]?.value || 0
        }));
        const today = new Date().toISOString().slice(0, 10);
        const contactToday = customers.filter(item => !["Reativado", "Sem interesse"].includes(item.reactivation_status) &&
            (item.next_contact_at && item.next_contact_at <= today || item.priority.level === "Alta"))
            .sort((a, b) => (a.next_contact_at || "9999").localeCompare(b.next_contact_at || "9999") || b.priority.score - a.priority.score)
            .slice(0, 12);
        return { yearA, yearB, rangeA, rangeB, sellers: [...new Set(rows.map(row => row.seller))].sort(), customers, timeline, contactToday };
    }

    operationalDashboard() {
        const today = new Date().toISOString().slice(0, 10);
        const customers = db.prepare(`SELECT id,customer_code,company_name,name,seller,active,reactivation_status,
            next_contact_at,reactivated_at,last_movement_at,priority_override,priority_notes
            FROM users WHERE customer_code IS NOT NULL AND TRIM(customer_code)<>''`).all();
        const metricsByCustomer = new Map();
        db.prepare("SELECT * FROM customer_monthly_metrics ORDER BY user_id,period_start,id").all().forEach(metric => {
            const items = metricsByCustomer.get(metric.user_id) || [];
            items.push(metric); metricsByCustomer.set(metric.user_id, items);
        });
        const contactsByCustomer = new Map();
        db.prepare("SELECT * FROM reactivation_contacts ORDER BY user_id,contacted_at DESC,id DESC").all().forEach(contact => {
            const items = contactsByCustomer.get(contact.user_id) || [];
            items.push(contact); contactsByCustomer.set(contact.user_id, items);
        });
        const enriched = customers.map(customer => {
            const metrics = metricsByCustomer.get(customer.id) || [];
            const analytics = resumoCliente(customer, metrics);
            return { ...customer, analytics, score: calcularScoreReativacao(customer, metrics, contactsByCustomer.get(customer.id) || []) };
        });
        const active = enriched.filter(item => Number(item.active ?? 1) !== 0);
        const currentRevenue = enriched.reduce((sum, item) => sum + item.analytics.totalAtual, 0);
        const previousRevenue = enriched.reduce((sum, item) => sum + item.analytics.totalAnterior, 0);
        const variation = previousRevenue ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 : currentRevenue ? 100 : 0;
        const returnable = item => !["Reativado", "Sem interesse"].includes(item.reactivation_status);
        const recentThreshold = new Date(); recentThreshold.setDate(recentThreshold.getDate() - 30);
        const recentStart = recentThreshold.toISOString().slice(0, 10);
        const pendingCreditRequests = db.prepare("SELECT COUNT(*) total FROM credit_requests WHERE status IN ('rascunho','gerada')").get().total;
        return {
            summary: {
                activeCustomers: active.length,
                inactiveCustomers: enriched.length - active.length,
                atRisk: active.filter(item => item.analytics.prioridade.level === "Alta").length,
                reactivated: enriched.filter(item => item.reactivation_status === "Reativado").length,
                revenue: currentRevenue,
                variation,
                negotiations: active.filter(item => item.reactivation_status === "Negociação").length,
                pendingReturns: active.filter(item => returnable(item) && item.next_contact_at && item.next_contact_at <= today).length
            },
            pending: {
                highPriorityNoContact: active.filter(item => item.analytics.prioridade.level === "Alta" && item.reactivation_status === "Não contatado").length,
                awaitingReturn: active.filter(item => item.reactivation_status === "Aguardando retorno").length,
                todayReturns: active.filter(item => returnable(item) && item.next_contact_at === today).length,
                overdueReturns: active.filter(item => returnable(item) && item.next_contact_at && item.next_contact_at < today).length,
                negotiations: active.filter(item => item.reactivation_status === "Negociação").length,
                recentlyReactivated: active.filter(item => item.reactivated_at && String(item.reactivated_at).slice(0, 10) >= recentStart).length,
                pendingCreditRequests
            },
            reference: { today, recentStart }
        };
    }

    customer(id) {
        const customer = db.prepare(`SELECT id,customer_code,company_name,name,jid,seller,last_movement_at,last_movement_value,accumulated_value,reactivation_status,reactivation_notes,next_contact_at,inactivity_reason,reactivated_at,main_products,latest_products,metric_status,metric_notes,priority_override,priority_notes,COALESCE(active,1) active,created_at FROM users WHERE id=?`).get(id);
        if (!customer) throw new Error("Cliente não encontrado.");
        customer.metrics = periodosEfetivos(db.prepare("SELECT * FROM customer_monthly_metrics WHERE user_id=? ORDER BY period_start,id").all(id));
        customer.purchases = db.prepare(`SELECT id,movement_number,movement_date,seller,value,items,notes,source_module,created_at
            FROM customer_movements WHERE user_id=? ORDER BY movement_date DESC,id DESC`).all(id);
        customer.status_options = this.statusOptions("metrics");
        customer.reactivation_status_options = this.statusOptions("reactivation");
        customer.tags = db.prepare(`SELECT t.id,t.name,t.color FROM reactivation_tags t
            JOIN reactivation_user_tags ut ON ut.tag_id=t.id WHERE ut.user_id=? ORDER BY t.name`).all(id);
        customer.contacts = db.prepare("SELECT * FROM reactivation_contacts WHERE user_id=? ORDER BY contacted_at DESC,id DESC").all(id);
        customer.commercial_history = db.prepare(`SELECT 'contato' type,kind title,notes,contacted_at date,next_contact_at,result,responsible,resulting_status,next_action
            FROM reactivation_contacts WHERE user_id=?
            UNION ALL SELECT 'campanha',c.nome,COALESCE(cr.contact_notes,cr.erro),COALESCE(cr.last_contact_at,cr.enviado_em,cr.added_at),cr.next_contact_at,cr.contact_result,NULL,NULL,NULL
            FROM campaign_recipients cr JOIN campaigns c ON c.id=cr.campaign_id WHERE cr.cliente_id=?
            ORDER BY date DESC`).all(id, id);
        const technician = db.prepare("SELECT id FROM technicians WHERE user_id=?").get(id);
        customer.credits = technician ? db.prepare(`SELECT id,document_number movement,sale_date,sale_value,commission_value credit,
            release_date,status FROM commissions WHERE technician_id=? ORDER BY sale_date DESC,id DESC`).all(technician.id) : [];
        customer.requests = technician ? db.prepare(`SELECT id,number,amount,request_date,requester,destination,status,created_at,
            pdf_filename,pdf_generated_at,CASE WHEN pdf_data IS NULL THEN 0 ELSE 1 END pdf_available
            FROM credit_requests WHERE technician_id=? ORDER BY request_date DESC,id DESC`).all(technician.id)
            .map(item => ({ ...item, document_url: item.status === "gerada" ? `/api/commissions/requests/${item.id}/pdf` : null })) : [];
        const years = [...new Set(customer.metrics.map(item => item.reference_year))].sort((a, b) => b - a);
        const totalB = customer.metrics.filter(item => item.reference_year === years[0]).reduce((sum, item) => sum + item.purchased_value, 0);
        const totalA = customer.metrics.filter(item => item.reference_year === years[1]).reduce((sum, item) => sum + item.purchased_value, 0);
        customer.priority = prioridade(customer, totalA, totalB, customer.metrics);
        customer.analytics = resumoCliente(customer, customer.metrics);
        customer.reactivation_score = calcularScoreReativacao(customer, customer.metrics, customer.contacts);
        customer.priority = customer.analytics.prioridade;
        customer.reactivation_result = customer.reactivated_at
            ? customer.metrics.filter(item => item.period_end >= customer.reactivated_at).reduce((sum, item) => sum + item.purchased_value, 0)
            : 0;
        return customer;
    }

    addManualPurchase(id, data = {}) {
        const customer = db.prepare("SELECT id,seller,last_movement_at,last_movement_value,reactivation_status FROM users WHERE id=?").get(id);
        if (!customer) throw new Error("Cliente não encontrado.");
        const date = texto(data.date);
        const value = dinheiro(data.value);
        const items = texto(data.items);
        const notes = texto(data.notes);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Informe uma data de compra válida.");
        if (!(value > 0)) throw new Error("Informe um valor de compra maior que zero.");
        if (!items) throw new Error("Informe os itens da compra.");
        const year = Number(date.slice(0, 4));
        const month = Number(date.slice(5, 7));
        const start = `${date.slice(0, 7)}-01`;
        const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
        const seller = texto(customer.seller) || "Outros";
        const movementNumber = `MANUAL-${id}-${Date.now()}`;
        return db.transaction(() => {
            const existing = db.prepare("SELECT id,purchased_value,order_count,movement_numbers FROM customer_monthly_metrics WHERE user_id=? AND period_start=? AND period_end=?").get(id, start, end);
            if (existing) {
                const total = Number(existing.purchased_value || 0) + value;
                const orders = Number(existing.order_count || 0) + 1;
                db.prepare(`UPDATE customer_monthly_metrics SET purchased_value=?,order_count=?,average_order_value=?,movement_numbers=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
                    .run(total, orders, total / orders, [existing.movement_numbers, movementNumber].filter(Boolean).join(","), existing.id);
            } else {
                const manualImportId = Number(db.prepare(`INSERT INTO customer_metric_imports(filename,reference_year,reference_month,total_rows,inserted_customers,updated_customers,total_value,period_start,period_end)
                    VALUES(?,?,?,?,?,?,?,?,?)`).run("Compra manual", year, month, 1, 0, 1, value, start, end).lastInsertRowid);
                db.prepare(`INSERT INTO customer_monthly_metrics(user_id,import_id,reference_year,reference_month,seller,report_seller,purchased_value,order_count,average_order_value,period_start,period_end,movement_numbers,manual_only)
                    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1)`).run(id, manualImportId, year, month, seller, seller, value, 1, value, start, end, movementNumber);
            }
            db.prepare(`INSERT INTO customer_movements(user_id,movement_number,movement_date,seller,value,items,notes,source_module)
                VALUES(?,?,?,?,?,?,?,'manual')`).run(id, movementNumber, date, seller, value, items, notes || null);
            db.prepare(`UPDATE users SET last_movement_at=CASE WHEN last_movement_at IS NULL OR last_movement_at<=? THEN ? ELSE last_movement_at END,
                last_movement_value=CASE WHEN last_movement_at IS NULL OR last_movement_at<=? THEN ? ELSE last_movement_value END,
                reactivation_status=CASE WHEN reactivation_status IN ('Entrar em contato','Contatado','Aguardando retorno','Negociação') THEN 'Reativado' ELSE reactivation_status END,
                reactivated_at=CASE WHEN reactivation_status IN ('Entrar em contato','Contatado','Aguardando retorno','Negociação') THEN COALESCE(reactivated_at,?) ELSE reactivated_at END
                WHERE id=?`).run(date, date, date, value, date, id);
            return this.customer(id);
        })();
    }

    updateCustomer(id, data, { compact = false } = {}) {
        const current = db.prepare("SELECT seller,last_movement_at,main_products,latest_products,metric_status,metric_notes,reactivation_status,next_contact_at,inactivity_reason,reactivation_notes,priority_override,priority_notes,COALESCE(active,1) active FROM users WHERE id=?").get(id);
        if (!current) throw new Error("Cliente não encontrado.");
        if (data.metric_status && !this.statusOptions("metrics").some(item => item.name === data.metric_status)) throw new Error("Status de métricas inválido.");
        if (data.reactivation_status && !this.statusOptions("reactivation").some(item => item.name === data.reactivation_status)) throw new Error("Etapa de reativação inválida.");
        if (data.priority_override && !["Alta", "Média", "Baixa"].includes(data.priority_override)) throw new Error("Prioridade inválida.");
        const value = (field, fallback, defaultValue = null) => data[field] === undefined ? fallback : texto(data[field]) || defaultValue;
        const next = {
            seller: value("seller", current.seller), last_movement_at: value("last_movement_at", current.last_movement_at),
            main_products: value("main_products", current.main_products), latest_products: value("latest_products", current.latest_products),
            metric_status: value("metric_status", current.metric_status, "Pendente de contato"), metric_notes: value("metric_notes", current.metric_notes),
            reactivation_status: value("reactivation_status", current.reactivation_status, "Não contatado"), next_contact_at: value("next_contact_at", current.next_contact_at),
            inactivity_reason: value("inactivity_reason", current.inactivity_reason), reactivation_notes: value("reactivation_notes", current.reactivation_notes),
            priority_override: value("priority_override", current.priority_override), priority_notes: value("priority_notes", current.priority_notes),
            active: data.active === undefined ? current.active : Number(Boolean(data.active))
        };
        db.prepare(`UPDATE users SET seller=?,last_movement_at=?,main_products=?,latest_products=?,metric_status=?,metric_notes=?,reactivation_status=?,
            next_contact_at=?,inactivity_reason=?,reactivation_notes=?,priority_override=?,priority_notes=?,active=?,
            reactivated_at=CASE WHEN ?='Reativado' THEN COALESCE(reactivated_at,date('now','localtime')) ELSE reactivated_at END,
            reactivation_updated_at=CURRENT_TIMESTAMP WHERE id=?`)
            .run(next.seller, next.last_movement_at, next.main_products, next.latest_products, next.metric_status, next.metric_notes,
                next.reactivation_status, next.next_contact_at, next.inactivity_reason, next.reactivation_notes, next.priority_override,
                next.priority_notes, next.active, next.reactivation_status, id);
        const labels = { metric_status: "status comercial", reactivation_status: "status de reativação", priority_override: "prioridade", seller: "vendedor" };
        const registrar = db.prepare(`INSERT INTO customer_activity_logs(user_id,activity_type,field_name,previous_value,current_value,seller)
            VALUES(?,?,?,?,?,?)`);
        Object.keys(labels).forEach(field => {
            if (String(current[field] ?? "") !== String(next[field] ?? "")) {
                registrar.run(id, field === "priority_override" ? "prioridade" : "alteracao", labels[field], current[field] || null, next[field] || null, next.seller || current.seller || null);
            }
        });
        if (compact) return db.prepare(`SELECT id,seller,last_movement_at,main_products,latest_products,metric_status,metric_notes,
            reactivation_status,next_contact_at,inactivity_reason,reactivation_notes,priority_override,priority_notes,
            COALESCE(active,1) active,reactivated_at FROM users WHERE id=?`).get(id);
        return this.customer(id);
    }
    updateProducts(id, data) { return this.updateCustomer(id, { ...this.customer(id), ...data }); }

    statusOptions(scope) {
        const options = db.prepare("SELECT id,scope,name,color,active,position FROM customer_status_options WHERE scope=? AND active=1 ORDER BY position,name").all(scope);
        // Reativação é um fluxo comercial fechado. Opções antigas permanecem no
        // banco para preservar o histórico, mas não podem voltar ao fluxo atual.
        return scope === "reactivation"
            ? options.filter(option => STATUS_REATIVACAO.includes(option.name))
            : options;
    }
    createStatus(data) {
        const scope = ["metrics", "reactivation"].includes(data.scope) ? data.scope : null;
        const name = texto(data.name);
        if (!scope || !name) throw new Error("Informe o tipo e o nome do status.");
        if (scope === "reactivation" && !STATUS_REATIVACAO.includes(name)) {
            throw new Error("A Reativação usa as etapas comerciais oficiais. Para criar uma opção personalizada, use Métricas.");
        }
        const existing = db.prepare("SELECT name FROM customer_status_options WHERE scope=? AND lower(name)=lower(?)").get(scope, name);
        if (existing) throw new Error(`A opção “${existing.name}” já existe em ${scope === "reactivation" ? "Reativação" : "Métricas"}.`);
        const result = db.prepare("INSERT INTO customer_status_options(scope,name,color,position) VALUES(?,?,?,COALESCE((SELECT MAX(position)+1 FROM customer_status_options WHERE scope=?),0))")
            .run(scope, name, /^#[0-9a-f]{6}$/i.test(data.color) ? data.color : "#6c757d", scope);
        return db.prepare("SELECT * FROM customer_status_options WHERE id=?").get(result.lastInsertRowid);
    }
    updateStatus(id, data) {
        const option = db.prepare("SELECT * FROM customer_status_options WHERE id=?").get(id);
        if (!option) throw new Error("Status não encontrado.");
        const name = texto(data.name); if (!name) throw new Error("Informe o nome do status.");
        const color = /^#[0-9a-f]{6}$/i.test(data.color) ? data.color : option.color;
        const field = option.scope === "metrics" ? "metric_status" : "reactivation_status";
        return db.transaction(() => {
            db.prepare(`UPDATE users SET ${field}=? WHERE ${field}=?`).run(name, option.name);
            db.prepare("UPDATE customer_status_options SET name=?,color=? WHERE id=?").run(name, color, id);
            return db.prepare("SELECT * FROM customer_status_options WHERE id=?").get(id);
        })();
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
