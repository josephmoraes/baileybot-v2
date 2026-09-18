import PDFDocument from "pdfkit";
import db from "../database/database.js";
import { resumoCliente } from "./customerAnalyticsService.js";
import settingsService from "./settingsService.js";

const texto = (value) => String(value ?? "").trim();
const moeda = (value) =>
  Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
const dataBr = (value) =>
  value
    ? new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString(
        "pt-BR",
      )
    : "—";
const periodo = (query) => {
  const end = /^\d{4}-\d{2}-\d{2}$/.test(texto(query.end))
    ? query.end
    : new Date().toISOString().slice(0, 10);
  const fallback = new Date(`${end}T12:00:00`);
  fallback.setDate(fallback.getDate() - 29);
  const start = /^\d{4}-\d{2}-\d{2}$/.test(texto(query.start))
    ? query.start
    : fallback.toISOString().slice(0, 10);
  if (start > end)
    throw new Error("A data inicial não pode ser posterior à final.");
  return { start, end, seller: texto(query.seller) || "todos" };
};
const filtroVendedor = ({ seller }, column, params) => {
  if (seller !== "todos") {
    params.push(seller);
    return ` AND COALESCE(${column},'Sem vendedor')=?`;
  }
  return "";
};
const resumir = (valor, limite = 54) => {
  const textoLimpo = String(valor ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return textoLimpo.length > limite
    ? `${textoLimpo.slice(0, limite - 1)}…`
    : textoLimpo || "—";
};
const STATUS_CREDITO = {
  disponivel: { label: "Disponível", observacao: "Pode gerar crédito" },
  pendente: { label: "Pendente", observacao: "Ainda não está liberado" },
  resgatado: {
    label: "Resgatado",
    observacao: "Já vinculado a uma solicitação",
  },
};
const statusCreditoSelecionados = (query) => {
  const selecionados = texto(query.credit_statuses)
    .split(",")
    .map((item) => item.trim())
    .filter((item) => Object.hasOwn(STATUS_CREDITO, item));
  if (!selecionados.length)
    throw new Error("Selecione ao menos um status de crédito.");
  return [...new Set(selecionados)];
};
const tabelaPdf = (doc, cabecalhos, linhas, larguras) => {
  const inicioX = doc.page.margins.left;
  const fimY = doc.page.height - doc.page.margins.bottom;
  const cabecalho = () => {
    let x = inicioX;
    doc.font("Helvetica-Bold").fontSize(7);
    cabecalhos.forEach((texto, indice) => {
      doc.text(texto, x, doc.y, { width: larguras[indice], lineBreak: false });
      x += larguras[indice];
    });
    doc.moveDown(0.6);
    doc.font("Helvetica");
  };
  cabecalho();
  linhas.forEach((linha) => {
    if (doc.y > fimY - 34) {
      doc.addPage();
      cabecalho();
    }
    let x = inicioX;
    const y = doc.y;
    doc.fontSize(7);
    linha.forEach((texto, indice) => {
      doc.text(resumir(texto), x, y, { width: larguras[indice], height: 24 });
      x += larguras[indice];
    });
    doc.y = y + 27;
  });
};

class ReportsService {
  sellers() {
    return settingsService.listarVendedores();
  }

  process(query) {
    const filters = periodo(query);
    const params = [filters.start, filters.end];
    const sellerFilter = filtroVendedor(filters, "seller", params);
    const contacts = db
      .prepare(
        `SELECT c.id,'contato' type,c.contacted_at occurred_at,u.customer_code,COALESCE(NULLIF(u.company_name,''),u.name) customer,
            COALESCE(NULLIF(c.responsible,''),u.seller,'Sem vendedor') seller,c.kind detail,c.notes,c.result,c.resulting_status,c.next_action,c.next_contact_at,c.resulting_status current_value
            FROM reactivation_contacts c JOIN users u ON u.id=c.user_id
            WHERE date(c.contacted_at) BETWEEN date(?) AND date(?)${sellerFilter.replaceAll("seller", "COALESCE(NULLIF(c.responsible,''),u.seller)")}`,
      )
      .all(...params);
    const movementParams = [filters.start, filters.end];
    const movementFilter = filtroVendedor(filters, "m.seller", movementParams);
    const movements = db
      .prepare(
        `SELECT m.id,'venda' type,m.movement_date occurred_at,u.customer_code,COALESCE(NULLIF(u.company_name,''),u.name) customer,
            COALESCE(NULLIF(m.seller,''),u.seller,'Sem vendedor') seller,m.items detail,m.notes,CAST(m.value AS TEXT) current_value
            FROM customer_movements m JOIN users u ON u.id=m.user_id
            WHERE date(m.movement_date) BETWEEN date(?) AND date(?)${movementFilter}`,
      )
      .all(...movementParams);
    const logParams = [filters.start, filters.end];
    const logFilter = filtroVendedor(filters, "l.seller", logParams);
    const changes = db
      .prepare(
        `SELECT l.id,l.activity_type type,l.occurred_at,u.customer_code,COALESCE(NULLIF(u.company_name,''),u.name) customer,
            COALESCE(NULLIF(l.seller,''),u.seller,'Sem vendedor') seller,l.field_name detail,l.current_value
            FROM customer_activity_logs l JOIN users u ON u.id=l.user_id
            WHERE date(l.occurred_at) BETWEEN date(?) AND date(?)${logFilter}`,
      )
      .all(...logParams);
    const activities = [...contacts, ...movements, ...changes].sort(
      (a, b) =>
        String(b.occurred_at).localeCompare(String(a.occurred_at)) ||
        b.id - a.id,
    );
    return {
      filters,
      activities,
      totals: {
        total: activities.length,
        contacts: contacts.length,
        sales: movements.length,
        changes: changes.length,
      },
    };
  }

  priorities(query) {
    const filters = periodo(query);
    const params = [];
    const priority = ["Alta", "Média", "Baixa"].includes(texto(query.priority))
      ? texto(query.priority)
      : "todos";
    const sellerFilter = filtroVendedor(filters, "u.seller", params);
    const customers = db
      .prepare(
        `SELECT u.id,u.customer_code,COALESCE(NULLIF(u.company_name,''),u.name) customer,u.seller,u.reactivation_status,u.next_contact_at,
            u.priority_override,u.priority_notes,u.last_movement_at FROM users u
            WHERE u.customer_code IS NOT NULL AND TRIM(u.customer_code)<>''${sellerFilter}`,
      )
      .all(...params);
    const metrics = db
      .prepare(
        "SELECT * FROM customer_monthly_metrics ORDER BY user_id,period_start,id",
      )
      .all();
    const rows = customers
      .map((customer) => {
        const all = metrics.filter((metric) => metric.user_id === customer.id);
        const selected = all.filter(
          (metric) =>
            metric.period_end >= filters.start &&
            metric.period_start <= filters.end,
        );
        const summary = resumoCliente(
          customer,
          all.filter((metric) => metric.period_end <= filters.end),
        );
        return {
          ...customer,
          priority: summary.prioridade,
          period_value: selected.reduce(
            (sum, metric) => sum + Number(metric.purchased_value || 0),
            0,
          ),
          period_orders: selected.reduce(
            (sum, metric) => sum + Number(metric.order_count || 0),
            0,
          ),
          last_purchase: summary.ultimaCompra,
        };
      })
      .filter((row) => priority === "todos" || row.priority.level === priority)
      .sort(
        (a, b) =>
          b.priority.score - a.priority.score ||
          b.period_value - a.period_value ||
          String(a.customer || a.customer_code || "").localeCompare(
            String(b.customer || b.customer_code || ""),
          ),
      );
    return {
      filters: { ...filters, priority },
      rows,
      totals: {
        total: rows.length,
        high: rows.filter((row) => row.priority.level === "Alta").length,
        medium: rows.filter((row) => row.priority.level === "Média").length,
        low: rows.filter((row) => row.priority.level === "Baixa").length,
      },
    };
  }

  reactivationContacts(query) {
    const process = this.process(query);
    const activities = process.activities.filter(
      (item) => item.type === "contato",
    );
    return {
      ...process,
      title: "Relatório de contatos de reativação",
      activities,
      totals: { total: activities.length, contacts: activities.length },
    };
  }

  summary(query) {
    const process = this.process(query);
    const priorities = this.priorities(query);
    return {
      filters: process.filters,
      cards: [
        {
          id: "movimentacoes",
          label: "Movimentações registradas",
          value: process.totals.total,
          detail: `${process.totals.contacts} contatos, ${process.totals.sales} vendas e ${process.totals.changes} alterações`,
        },
        {
          id: "prioridade-alta",
          label: "Clientes de prioridade alta",
          value: priorities.totals.high,
          detail: `de ${priorities.totals.total} clientes no filtro`,
        },
        {
          id: "vendas",
          label: "Vendas no período",
          value: moeda(
            priorities.rows.reduce((sum, row) => sum + row.period_value, 0),
          ),
          detail: `${priorities.rows.reduce((sum, row) => sum + row.period_orders, 0)} pedidos registrados`,
        },
        {
          id: "contatos",
          label: "Contatos realizados",
          value: process.totals.contacts,
          detail: "registrados no período selecionado",
        },
      ],
    };
  }

  card(query) {
    const card = texto(query.card);
    const process = this.process(query);
    const priorities = this.priorities(query);
    if (card === "movimentacoes")
      return {
        ...process,
        title: "Movimentações registradas",
        rows: process.activities,
      };
    if (card === "contatos")
      return {
        ...process,
        title: "Contatos realizados",
        rows: process.activities.filter((item) => item.type === "contato"),
      };
    if (card === "prioridade-alta")
      return {
        ...priorities,
        title: "Clientes de prioridade alta",
        rows: priorities.rows.filter((item) => item.priority.level === "Alta"),
      };
    if (card === "vendas")
      return {
        ...priorities,
        title: "Vendas no período",
        rows: priorities.rows.filter((item) => item.period_value > 0),
      };
    throw new Error("Card de acompanhamento inválido.");
  }

  comissoesTecnicos(query) {
    const filters = periodo(query);
    const statuses = statusCreditoSelecionados(query);
    db.prepare(
      "UPDATE commissions SET status='liberada' WHERE status='pendente' AND release_date<=date('now','localtime')",
    ).run();
    const commissions = db
      .prepare(
        `SELECT c.id,c.movement,c.document_number,c.sale_date,c.sale_value,c.rate,c.commission_value,c.release_date,c.status,
            t.id technician_id,t.name technician_name,t.og1_code,rc.amount rescued_amount,r.number request_number,r.request_date
            FROM commissions c JOIN technicians t ON t.id=c.technician_id
            LEFT JOIN credit_request_commissions rc ON rc.commission_id=c.id
            LEFT JOIN credit_requests r ON r.id=rc.request_id
            WHERE t.is_test=0 AND date(c.sale_date) BETWEEN date(?) AND date(?)
            ORDER BY t.name,c.sale_date,c.id`,
      )
      .all(filters.start, filters.end)
      .map((item) => {
        const credit_status = item.request_number
          ? "resgatado"
          : item.status === "pendente"
            ? "pendente"
            : "disponivel";
        return {
          ...item,
          credit_status,
          credit_value: Number(item.rescued_amount ?? item.commission_value),
        };
      });
    const byTechnician = new Map();
    commissions.forEach((item) => {
      if (!byTechnician.has(item.technician_id))
        byTechnician.set(item.technician_id, {
          id: item.technician_id,
          name: item.technician_name,
          og1_code: item.og1_code,
          commissions: [],
        });
      byTechnician.get(item.technician_id).commissions.push(item);
    });
    const technicians = [...byTechnician.values()]
      .map((technician) => {
        const selected = technician.commissions.filter((item) =>
          statuses.includes(item.credit_status),
        );
        const totals = {
          sales: technician.commissions.reduce(
            (sum, item) => sum + Number(item.sale_value),
            0,
          ),
          credit: technician.commissions.reduce(
            (sum, item) => sum + Number(item.commission_value),
            0,
          ),
        };
        const credits = Object.fromEntries(
          Object.keys(STATUS_CREDITO).map((status) => [
            status,
            technician.commissions
              .filter((item) => item.credit_status === status)
              .reduce((sum, item) => sum + item.credit_value, 0),
          ]),
        );
        return { ...technician, commissions: selected, totals, credits };
      })
      .filter((item) => item.commissions.length);
    const selectedCommissions = commissions.filter((item) =>
      statuses.includes(item.credit_status),
    );
    return {
      title: "Relatório de comissões dos técnicos",
      filters,
      statuses,
      technicians,
      totals: {
        technicians: technicians.length,
        sales: selectedCommissions.reduce(
          (sum, item) => sum + Number(item.sale_value),
          0,
        ),
        credit: selectedCommissions.reduce(
          (sum, item) => sum + Number(item.commission_value),
          0,
        ),
      },
    };
  }

  baixasCreditos(query) {
    const filters = periodo(query);
    const requests = db
      .prepare(
        `SELECT r.id,r.number,r.amount,r.request_date,r.requester,r.destination,r.materials,r.notes,r.status,
            t.name technician_name,t.og1_code FROM credit_requests r JOIN technicians t ON t.id=r.technician_id
            WHERE t.is_test=0 AND r.status='gerada' AND date(r.request_date) BETWEEN date(?) AND date(?)
            ORDER BY r.request_date,r.id`,
      )
      .all(filters.start, filters.end)
      .map((request) => ({
        ...request,
        commissions: db
          .prepare(
            `SELECT c.movement,c.document_number,c.sale_date,c.sale_value,c.rate,rc.amount credit_value
                    FROM credit_request_commissions rc JOIN commissions c ON c.id=rc.commission_id
                    WHERE rc.request_id=? ORDER BY c.sale_date,c.id`,
          )
          .all(request.id),
      }));
    return {
      title: "Relatório de baixas de créditos",
      filters,
      requests,
      totals: {
        requests: requests.length,
        credit: requests.reduce((sum, item) => sum + Number(item.amount), 0),
      },
    };
  }

  data(type, query) {
    if (type === "processo") return this.process(query);
    if (type === "contatos-reativacao") return this.reactivationContacts(query);
    if (type === "prioridades") return this.priorities(query);
    if (type === "comissoes-tecnicos") return this.comissoesTecnicos(query);
    if (type === "baixas-creditos") return this.baixasCreditos(query);
    if (type === "acompanhamento")
      return query.card ? this.card(query) : this.summary(query);
    throw new Error("Tipo de relatório inválido.");
  }

  async pdf(type, query) {
    if (type === "comissoes-tecnicos" || type === "baixas-creditos")
      return this.pdfComissoes(type, query);
    const report = this.data(type, query);
    const title =
      report.title ||
      (type === "processo"
        ? "Relatório de movimentações"
        : type === "prioridades"
          ? "Relatório de prioridades"
          : "Acompanhamento comercial");
    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: 32,
      bufferPages: true,
      info: { Title: title },
    });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    const done = new Promise((resolve, reject) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
    });
    doc.fontSize(18).text(title).moveDown(0.3);
    doc
      .fontSize(10)
      .fillColor("#555")
      .text(
        `Período: ${dataBr(report.filters.start)} a ${dataBr(report.filters.end)} • Vendedor: ${report.filters.seller === "todos" ? "Todos" : report.filters.seller}`,
      )
      .fillColor("black")
      .moveDown();
    if (type === "acompanhamento" && !query.card)
      report.cards.forEach((card) => {
        doc.fontSize(12).text(card.label);
        doc.fontSize(16).text(String(card.value));
        doc
          .fontSize(9)
          .fillColor("#555")
          .text(card.detail)
          .fillColor("black")
          .moveDown();
      });
    else if (type === "acompanhamento")
      report.rows.forEach((row) => {
        const prioridade = row.priority
          ? `${row.priority.level} (${row.priority.score})`
          : row.type;
        doc
          .fontSize(10)
          .text(
            `${prioridade} • ${row.customer || row.customer_code || "Cliente"}`,
          );
        doc
          .fontSize(9)
          .fillColor("#555")
          .text(
            `${row.seller || "Sem vendedor"}${row.period_value !== undefined ? ` • ${moeda(row.period_value)}` : row.detail ? ` • ${row.detail}` : ""}`,
          )
          .fillColor("black")
          .moveDown(0.5);
      });
    else if (type === "processo" || type === "contatos-reativacao")
      tabelaPdf(
        doc,
        [
          "Data",
          "Cliente / OG1",
          "Vendedor",
          "Tipo",
          "Descrição / observação",
          "Status / resultado",
          "Próxima ação / retorno",
        ],
        report.activities.map((item) => [
          dataBr(item.occurred_at),
          item.customer || item.customer_code,
          item.seller,
          item.type,
          item.notes || item.detail,
          item.resulting_status || item.result || item.current_value,
          [item.next_action, dataBr(item.next_contact_at)]
            .filter(Boolean)
            .join(" — "),
        ]),
        [55, 125, 75, 55, 190, 105, 120],
      );
    else
      tabelaPdf(
        doc,
        [
          "Prioridade",
          "Score",
          "Cliente / OG1",
          "Vendedor",
          "Valor no período",
          "Pedidos",
          "Motivo",
        ],
        report.rows.map((row) => [
          row.priority.level,
          row.priority.score,
          row.customer || row.customer_code,
          row.seller,
          moeda(row.period_value),
          row.period_orders,
          row.priority.reason,
        ]),
        [65, 42, 140, 90, 95, 55, 235],
      );
    doc.end();
    return done;
  }

  async pdfComissoes(type, query) {
    const report = this.data(type, query);
    if (type === "comissoes-tecnicos")
      return this.pdfComissoesTecnicosImpressao(report);
    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: 32,
      bufferPages: true,
      info: { Title: report.title },
    });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    const done = new Promise((resolve, reject) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
    });
    doc.fontSize(18).text(report.title).moveDown(0.3);
    doc
      .fontSize(10)
      .fillColor("#555")
      .text(
        `Período: ${dataBr(report.filters.start)} a ${dataBr(report.filters.end)}`,
      )
      .fillColor("black")
      .moveDown();
    {
      doc
        .fontSize(11)
        .text(
          `Solicitações: ${report.totals.requests}   •   Total de créditos: ${moeda(report.totals.credit)}`,
        )
        .moveDown();
      report.requests.forEach((request) => {
        doc
          .font("Helvetica-Bold")
          .fontSize(12)
          .text(
            `${request.number} • ${request.technician_name} • OG1 ${request.og1_code || "—"}`,
          );
        doc
          .font("Helvetica")
          .fontSize(9)
          .text(
            `Solicitado em ${dataBr(request.request_date)} por ${request.requester} • Destino: ${request.destination} • Crédito: ${moeda(request.amount)}`,
          );
        if (request.materials || request.notes)
          doc
            .fontSize(8)
            .fillColor("#555")
            .text(
              [request.materials, request.notes].filter(Boolean).join(" • "),
            )
            .fillColor("black");
        tabelaPdf(
          doc,
          ["Movimento", "Data", "Venda", "%", "Crédito resgatado"],
          request.commissions.map((item) => [
            item.movement || item.document_number,
            dataBr(item.sale_date),
            moeda(item.sale_value),
            `${Number(item.rate)}%`,
            moeda(item.credit_value),
          ]),
          [145, 90, 110, 65, 120],
        );
        doc.moveDown();
      });
      if (!report.requests.length)
        doc
          .fontSize(11)
          .text("Nenhuma solicitação gerada no período selecionado.");
    }
    doc.end();
    return done;
  }

  async pdfComissoesTecnicosImpressao(report) {
    const doc = new PDFDocument({
      size: "A4",
      margin: 36,
      bufferPages: true,
      info: { Title: report.title },
    });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    const done = new Promise((resolve, reject) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
    });
    const colors = {
      ink: "#1f2933",
      muted: "#61707c",
      green: "#078a52",
      cyan: "#007b9e",
      panel: "#f4f8f6",
      border: "#d5dfda",
      header: "#eaf3ef",
    };
    const pageBottom = () => doc.page.height - doc.page.margins.bottom;
    const drawText = (value, x, y, options = {}) =>
      doc
        .fillColor(options.color || colors.ink)
        .font(options.font || "Helvetica")
        .fontSize(options.size || 8)
        .text(String(value ?? "—"), x, y, {
          width: options.width,
          height: options.height,
          lineBreak: options.lineBreak ?? false,
          ellipsis: options.ellipsis ?? true,
        });
    const drawCard = (x, y, label, value, detail, accent) => {
      doc
        .roundedRect(x, y, 258, 62, 8)
        .fillAndStroke(colors.panel, colors.border);
      doc.roundedRect(x + 14, y + 16, 29, 29, 7).fill(accent);
      drawText("$", x + 24, y + 24, {
        size: 13,
        color: "#ffffff",
        font: "Helvetica-Bold",
      });
      drawText(label, x + 54, y + 14, { size: 8, color: colors.muted });
      drawText(value, x + 54, y + 27, {
        size: 15,
        color: colors.ink,
        font: "Helvetica-Bold",
      });
      drawText(detail, x + 54, y + 45, { size: 7, color: colors.muted });
    };
    const statusLabel = report.statuses
      .map((status) => STATUS_CREDITO[status].label.toUpperCase())
      .join(" + ");
    const creditCardLabel =
      report.statuses.length === 1
        ? `Crédito ${STATUS_CREDITO[report.statuses[0]].label.toLowerCase()}`
        : "Crédito selecionado";
    const header = (page) => {
      drawText("COMISSÕES", 36, 29, {
        size: 8,
        color: colors.green,
        font: "Helvetica-Bold",
      });
      drawText("Relatório de créditos", 36, 45, {
        size: 18,
        color: colors.ink,
        font: "Helvetica-Bold",
      });
      drawText(
        `Período: ${dataBr(report.filters.start)} a ${dataBr(report.filters.end)}`,
        36,
        68,
        { size: 8.5, color: colors.muted },
      );
      doc
        .roundedRect(doc.page.width - 174, 34, 138, 24, 12)
        .fillAndStroke(colors.header, colors.border);
      drawText(statusLabel, doc.page.width - 158, 42, {
        size: 7.2,
        color: colors.green,
        font: "Helvetica-Bold",
        width: 106,
      });
      if (page === 1) {
        drawCard(
          36,
          102,
          "Vendas comissionadas",
          moeda(report.totals.sales),
          `${report.technicians.reduce((sum, item) => sum + item.commissions.length, 0)} lançamento(s) no período`,
          colors.cyan,
        );
        drawCard(
          303,
          102,
          creditCardLabel,
          moeda(report.totals.credit),
          `${report.technicians.length} técnico(s) no relatório`,
          colors.green,
        );
        return 181;
      }
      return 108;
    };
    const footer = (page) => {
      doc.strokeColor(colors.border).lineWidth(0.55).moveTo(36, 775).lineTo(559, 775).stroke();
      drawText(
        "BaileyBot - relatório para conferência e geração de crédito no OG1",
        36,
        783,
        { size: 6.7, color: colors.muted, width: 420 },
      );
      drawText(`Página ${page}`, 510, 783, {
        size: 6.7,
        color: colors.muted,
        width: 49,
      });
    };
    const tableHeader = (y) => {
      doc.rect(36, y, 523, 26).fill(colors.header);
      [
        [48, "NOME", 125],
        [184, "CÓDIGO\nOG1", 74],
        [272, "CRÉDITO TOTAL\nDISPONÍVEL", 104],
        [389, "MOVIMENTO REFERENTE A CADA VALOR", 158],
      ].forEach(([x, label, width]) => {
        label.split("\n").forEach((line, index) =>
          drawText(line, x, y + 7 + index * 8, {
            size: 6.8,
            color: colors.muted,
            font: "Helvetica-Bold",
            width,
          }),
        );
      });
      return y + 26;
    };
    const rows = report.technicians.map((technician) => {
      const movements = technician.commissions.map((item) =>
        `${item.movement || item.document_number || "Sem movimento"} - ${moeda(item.credit_value)}`,
      );
      return {
        name: technician.name,
        og1: technician.og1_code || "—",
        credit: technician.commissions.reduce(
          (sum, item) => sum + Number(item.credit_value),
          0,
        ),
        movements: movements.length ? movements : ["Sem crédito no filtro"],
      };
    });
    let page = 1;
    let y = tableHeader(header(page));
    rows.forEach((row) => {
      const movementLines = Math.max(1, Math.ceil(row.movements.length / 2));
      const rowHeight = Math.max(42, 28 + movementLines * 13);
      if (y + rowHeight > pageBottom() - 34) {
        footer(page);
        doc.addPage();
        page += 1;
        y = tableHeader(header(page));
      }
      doc
        .strokeColor(colors.border)
        .lineWidth(0.55)
        .moveTo(36, y + rowHeight)
        .lineTo(559, y + rowHeight)
        .stroke();
      drawText(row.name, 48, y + 15, {
        size: 8,
        color: colors.ink,
        font: "Helvetica-Bold",
        width: 125,
      });
      drawText(row.og1, 184, y + 15, { size: 8.4, width: 74 });
      drawText(moeda(row.credit), 272, y + 15, {
        size: 8.4,
        color: row.credit ? colors.green : colors.muted,
        font: "Helvetica-Bold",
        width: 104,
      });
      row.movements.forEach((movement, index) =>
        drawText(movement, 389, y + 13 + index * 13, {
          size: 7.7,
          color: colors.ink,
          width: 158,
        }),
      );
      y += rowHeight;
    });
    if (!rows.length)
      drawText(
        "Nenhuma comissão encontrada para os status e período selecionados.",
        36,
        y + 18,
        { size: 10, color: colors.muted, width: 500 },
      );
    footer(page);
    doc.end();
    return done;
  }
}

export default new ReportsService();
