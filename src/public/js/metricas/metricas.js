let metricasClientesCache = [];
let metricasFilaCache = [];
let metricasArquivo = null;
let metricasStatus = [];
let metricasPesquisa = "";

const mtSeguro = valor =>
    String(valor ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");

const mtMoeda = valor =>
    Number(valor || 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
    });

const mtPercentual = valor =>
    `${Number(valor || 0) >= 0 ? "+" : ""}${Number(valor || 0).toLocaleString("pt-BR", {
        maximumFractionDigits: 1
    })}%`;

const mtData = valor =>
    valor
        ? new Date(`${String(valor).slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR")
        : "—";

async function mtJson(url, options) {
    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || "Não foi possível concluir a operação.");
    }

    return data;
}

function mtMostrarAviso(mensagem, tipo = "success") {
    let container = document.getElementById("metricasAvisos");

    if (!container) {
        container = document.createElement("div");
        container.id = "metricasAvisos";
        container.className = "metrics-toast-container";
        container.setAttribute("aria-live", "polite");
        container.setAttribute("aria-atomic", "true");
        document.body.appendChild(container);
    }

    const aviso = document.createElement("div");
    aviso.className = `metrics-toast metrics-toast-${tipo}`;
    aviso.setAttribute("role", tipo === "success" ? "status" : "alert");

    const icone = document.createElement("i");
    icone.className = tipo === "success"
        ? "bi bi-check-circle-fill"
        : "bi bi-exclamation-triangle-fill";

    const texto = document.createElement("span");
    texto.textContent = mensagem;

    aviso.append(icone, texto);
    container.appendChild(aviso);

    window.requestAnimationFrame(() => aviso.classList.add("show"));

    window.setTimeout(() => {
        aviso.classList.remove("show");
        window.setTimeout(() => aviso.remove(), 220);
    }, 3500);
}


function mtAtualizarRecortes() {
    const preset = document.getElementById("metricasPreset").value;
    const select = document.getElementById("metricasRecorte");

    const opcoes =
        preset === "quarter"
            ? [
                ["1-3", "1º trimestre"],
                ["4-6", "2º trimestre"],
                ["7-9", "3º trimestre"],
                ["10-12", "4º trimestre"]
            ]
            : preset === "semester"
                ? [
                    ["1-6", "1º semestre"],
                    ["7-12", "2º semestre"]
                ]
                : [
                    ["1-12", "Ano completo"]
                ];

    select.innerHTML = opcoes
        .map(([value, label]) => `<option value="${value}">${label}</option>`)
        .join("");

    select.disabled = preset === "custom";

    document
        .getElementById("metricasDatasPersonalizadas")
        .classList.toggle("d-none", preset !== "custom");
}


function mtParametros() {
    const yearA = document.getElementById("metricasAnoA").value;
    const yearB = document.getElementById("metricasAnoB").value;
    const seller = document.getElementById("metricasVendedor").value;

    if (document.getElementById("metricasPreset").value === "custom") {
        return new URLSearchParams({
            yearA,
            yearB,
            seller,
            startA: document.getElementById("metricasInicioA").value,
            endA: document.getElementById("metricasFimA").value,
            startB: document.getElementById("metricasInicioB").value,
            endB: document.getElementById("metricasFimB").value
        });
    }

    const [fromMonth, toMonth] =
        document.getElementById("metricasRecorte").value.split("-");

    return new URLSearchParams({
        yearA,
        yearB,
        seller,
        fromMonth,
        toMonth
    });
}


function mtClientesFiltrados() {
    const status =
        document.getElementById("metricasStatusFiltro")?.value || "todos";

    const priority =
        document.getElementById("metricasPrioridadeFiltro")?.value || "todos";

    const order =
        document.getElementById("metricasOrdenacao")?.value || "priority-desc";

    const lista = metricasClientesCache.filter(item =>
        (status === "todos" || item.metric_status === status) &&
        (priority === "todos" || item.priority.level === priority) &&
        `${item.customer_code} ${item.company_name}`
            .toLowerCase()
            .includes(metricasPesquisa)
    );

    const comparadores = {
        "priority-desc": (a, b) =>
            b.priority.score - a.priority.score,

        "variation-desc": (a, b) =>
            b.variation - a.variation,

        "variation-asc": (a, b) =>
            a.variation - b.variation,

        "name-asc": (a, b) =>
            (a.company_name || "").localeCompare(
                b.company_name || "",
                "pt-BR"
            ),

        "name-desc": (a, b) =>
            (b.company_name || "").localeCompare(
                a.company_name || "",
                "pt-BR"
            )
    };

    return [...lista].sort(comparadores[order]);
}


function mtRenderTable() {
    const customers = mtClientesFiltrados();

    document.getElementById("metricasTabela").innerHTML =
        customers.length
            ? customers.map(customer => {
                const badge =
                    customer.priority.level === "Alta"
                        ? "danger"
                        : customer.priority.level === "Média"
                            ? "warning text-dark"
                            : "success";

                const status = metricasStatus.find(
                    item => item.name === customer.metric_status
                );

                return `
                    <tr
                        role="button"
                        data-cliente-metrica="${customer.id}"
                    >
                        <td>
                            <span class="badge bg-${badge}">
                                ${mtSeguro(customer.priority.level)}
                            </span>
                        </td>

                        <td><strong>${Number(customer.reactivation_score?.score || 0)}</strong>/100</td>

                        <td>
                            <span
                                class="badge"
                                style="background:${mtSeguro(status?.color || "#6c757d")}"
                            >
                                ${mtSeguro(customer.metric_status)}
                            </span>
                        </td>

                        <td>
                            ${mtSeguro(customer.reactivation_status || "Não contatado")}
                        </td>

                        <td>
                            ${mtSeguro(customer.customer_code)}
                        </td>

                        <td>
                            <strong>
                                ${mtSeguro(customer.company_name || "Nome não informado")}
                            </strong>
                        </td>

                        <td>${mtMoeda(customer.totalA)}</td>
                        <td>${mtMoeda(customer.totalB)}</td>

                        <td class="${customer.variation < 0 ? "text-danger" : "text-success"}">
                            ${mtPercentual(customer.variation)}
                        </td>

                        <td class="small text-secondary">
                            ${mtSeguro(customer.priority.reason)}
                        </td>
                    </tr>
                `;
            }).join("")
            : `
                <tr>
                    <td
                        colspan="10"
                        class="text-center text-secondary py-5"
                    >
                        Nenhum cliente encontrado com estes filtros.
                    </td>
                </tr>
            `;
}


function mtRenderChart(items, labelA, labelB) {
    const max = Math.max(
        1,
        ...items.flatMap(item => [item.valueA, item.valueB])
    );

    document.getElementById("metricasGrafico").innerHTML =
        items.length
            ? `
                <div class="metrics-legend">
                    <span>
                        <i class="year-a"></i>
                        ${mtSeguro(labelA)}
                    </span>

                    <span>
                        <i class="year-b"></i>
                        ${mtSeguro(labelB)}
                    </span>
                </div>

                <div class="metrics-bars">
                    ${items.map(item => `
                        <div class="metrics-month">

                            <div class="metrics-columns">
                                <span
                                    class="year-a"
                                    style="height:${Math.max(
                                        item.valueA ? 4 : 0,
                                        item.valueA / max * 150
                                    )}px"
                                    title="${mtMoeda(item.valueA)}"
                                ></span>

                                <span
                                    class="year-b"
                                    style="height:${Math.max(
                                        item.valueB ? 4 : 0,
                                        item.valueB / max * 150
                                    )}px"
                                    title="${mtMoeda(item.valueB)}"
                                ></span>
                            </div>

                            <small>
                                ${mtSeguro(item.label)}
                            </small>

                        </div>
                    `).join("")}
                </div>
            `
            : `
                <div class="app-state py-4">
                    <p class="mb-0">
                        Não há relatórios dentro do período escolhido.
                    </p>
                </div>
            `;
}


function mtRenderFila() {
    document.getElementById("metricasFilaTotal").textContent =
        metricasFilaCache.length;

    document.getElementById("metricasFilaHoje").innerHTML =
        metricasFilaCache.length
            ? metricasFilaCache.map(item => `
                <button
                    type="button"
                    class="list-group-item list-group-item-action bg-transparent text-light border-secondary"
                    data-cliente-metrica="${item.id}"
                >
                    <div class="d-flex justify-content-between gap-3">

                        <div>
                            <strong>
                                ${mtSeguro(item.company_name)}
                            </strong>

                            <small class="d-block text-secondary">
                                ${mtSeguro(item.priority.reason)}
                            </small>
                        </div>

                        <div class="text-end">

                            <span class="badge bg-danger">
                                ${mtSeguro(item.priority.level)}
                            </span>

                            <small class="d-block text-secondary">
                                ${
                                    item.next_contact_at
                                        ? `Retorno ${mtData(item.next_contact_at)}`
                                        : "Contato recomendado"
                                }
                            </small>

                        </div>

                    </div>
                </button>
            `).join("")
            : `
                <div class="p-4 text-center text-secondary">
                    Nenhum contato prioritário para hoje.
                </div>
            `;
}


function mtGraficoCliente(metrics) {
    if (!metrics.length) {
        return `
            <div class="app-state py-4">
                <p class="mb-0">
                    Sem compras importadas.
                </p>
            </div>
        `;
    }

    const ordered = [...metrics].sort(
        (a, b) => a.period_start.localeCompare(b.period_start)
    );

    const width = 900;
    const height = 260;
    const pad = 48;

    const maxValue = Math.max(
        ...ordered.map(item => Number(item.purchased_value))
    );

    const minValue = Math.min(
        ...ordered.map(item => Number(item.purchased_value))
    );

    const scaleMax = Math.max(1, maxValue);

    const x = index =>
        ordered.length === 1
            ? width / 2
            : pad +
              index *
              ((width - pad * 2) / (ordered.length - 1));

    const y = value =>
        height -
        pad -
        (Number(value) / scaleMax) *
        (height - pad * 2);

    const points = ordered
        .map(
            (item, index) =>
                `${x(index)},${y(item.purchased_value)}`
        )
        .join(" ");

    const circles = ordered.map((item, index) => {
        const high =
            Number(item.purchased_value) === maxValue;

        const low =
            Number(item.purchased_value) === minValue;

        const movement =
            item.movement_numbers
                ? ` · Movimento(s): ${item.movement_numbers}`
                : "";

        return `
            <g class="${
                high
                    ? "metric-point-high"
                    : low
                        ? "metric-point-low"
                        : ""
            }">

                <circle
                    cx="${x(index)}"
                    cy="${y(item.purchased_value)}"
                    r="${high || low ? 7 : 5}"
                    tabindex="0"
                >
                    <title>
                        ${mtSeguro(mtData(item.period_start))}:
                        ${mtSeguro(mtMoeda(item.purchased_value))}
                        ${mtSeguro(movement)}
                    </title>
                </circle>

                ${
                    high || low
                        ? `
                            <text
                                x="${x(index)}"
                                y="${Math.max(
                                    16,
                                    y(item.purchased_value) - 13
                                )}"
                                text-anchor="middle"
                            >
                                ${mtSeguro(mtMoeda(item.purchased_value))}
                            </text>
                        `
                        : ""
                }

                <text
                    class="metric-axis-label"
                    x="${x(index)}"
                    y="${height - 13}"
                    text-anchor="middle"
                >
                    ${mtSeguro(mtData(item.period_start).slice(0, 5))}
                </text>

            </g>
        `;
    }).join("");

    return `
        <div class="d-flex gap-2 mb-2">

            <span class="badge bg-success">
                Maior compra: ${mtMoeda(maxValue)}
            </span>

            <span class="badge bg-info text-dark">
                Menor compra: ${mtMoeda(minValue)}
            </span>

        </div>

        <div class="client-line-chart">

            <svg
                viewBox="0 0 ${width} ${height}"
                role="img"
                aria-label="Histórico de compras do cliente"
            >

                <line
                    x1="${pad}"
                    y1="${height - pad}"
                    x2="${width - pad}"
                    y2="${height - pad}"
                    class="metric-axis"
                ></line>

                <polyline
                    points="${points}"
                    class="metric-line"
                ></polyline>

                ${circles}

            </svg>

        </div>

        <small class="text-secondary">
            Passe o mouse ou foque um ponto para ver valor,
            período e número do movimento.
        </small>
    `;
}


async function carregarMetricasClientes() {
    const data = await mtJson(
        `/api/customer-metrics/dashboard?${mtParametros()}`
    );

    metricasClientesCache = data.customers;
    metricasFilaCache = data.contactToday || [];

    const labelA =
        `${mtData(data.rangeA.start)} a ${mtData(data.rangeA.end)}`;

    const labelB =
        `${mtData(data.rangeB.start)} a ${mtData(data.rangeB.end)}`;

    document.getElementById("metricasCabA").textContent = labelA;
    document.getElementById("metricasCabB").textContent = labelB;

    const totalA = data.customers.reduce(
        (sum, item) => sum + item.totalA,
        0
    );

    const totalB = data.customers.reduce(
        (sum, item) => sum + item.totalB,
        0
    );

    const result = data.customers.reduce(
        (sum, item) => sum + item.reactivation_result,
        0
    );

    document.getElementById("metricasCards").innerHTML = [
        ["Clientes analisados", data.customers.length, "bi-people"],
        ["Período anterior", mtMoeda(totalA), "bi-calendar3"],
        ["Período atual", mtMoeda(totalB), "bi-calendar-check"],
        ["Resultado das reativações", mtMoeda(result), "bi-cash-coin"]
    ].map(([label, value, icon]) => `
        <div class="col-sm-6 col-xl-3">

            <div class="card metrics-panel metrics-summary-card text-light shadow h-100">

                <div class="card-body">
                    <i class="bi ${icon} text-success"></i>

                    <small class="d-block mt-2">
                        ${label}
                    </small>

                    <strong class="fs-4">
                        ${value}
                    </strong>
                </div>

            </div>

        </div>
    `).join("");

    const select =
        document.getElementById("metricasVendedor");

    const selected = select.value;

    const sellers = [
        ...new Set([
            ...(data.sellers || []),
            "Alisson",
            "Noberto",
            "Aldener",
            "Letícia",
            "Clayton",
            "Outros"
        ])
    ].sort();

    select.innerHTML =
        '<option value="todos">Todos</option>' +
        sellers
            .map(item => `<option>${mtSeguro(item)}</option>`)
            .join("");

    select.value =
        sellers.includes(selected)
            ? selected
            : "todos";

    mtRenderTable();
    mtRenderFila();
    mtRenderChart(data.timeline, labelA, labelB);
}


async function mtAbrirCliente(id) {
    const client = await mtJson(
        `/api/customer-metrics/clients/${id}`
    );

    document.getElementById("metricasFichaTitulo").textContent =
        `${client.customer_code || "Sem código"} — ${
            client.company_name ||
            client.name ||
            "Nome não informado"
        }`;

    const hasLegacyReactivationStatus = client.reactivation_status && !client.reactivation_status_options.some(item => item.name === client.reactivation_status);
    const statusOptions =
        `${hasLegacyReactivationStatus ? `<option value="" selected disabled>Status anterior: ${mtSeguro(client.reactivation_status)} — selecione uma etapa</option>` : ""}` + client.reactivation_status_options
            .map(item => `
                <option
                    ${item.name === client.reactivation_status ? "selected" : ""}
                >
                    ${mtSeguro(item.name)}
                </option>
            `)
            .join("");

    const commercialOptions =
        client.status_options
            .map(item => `
                <option
                    ${item.name === client.metric_status ? "selected" : ""}
                >
                    ${mtSeguro(item.name)}
                </option>
            `)
            .join("");

    const contacts =
        client.contacts.length
            ? client.contacts.map(item => `
                <div class="reactivation-history-item">

                    <div>
                        <strong>
                            ${mtSeguro(item.kind)}
                        </strong>

                        <small>
                            ${new Date(item.contacted_at).toLocaleString("pt-BR")}
                        </small>
                    </div>

                    <p>
                        ${mtSeguro(item.notes || "Sem observação")}
                    </p>

                    ${
                        item.result
                            ? `
                                <span>
                                    Resultado:
                                    ${mtSeguro(item.result)}
                                </span>
                            `
                            : ""
                    }

                    ${
                        item.next_contact_at
                            ? `
                                <span>
                                    Próximo:
                                    ${mtData(item.next_contact_at)}
                                </span>
                            `
                            : ""
                    }

                </div>
            `).join("")
            : `
                <p class="text-secondary">
                    Nenhum contato registrado.
                </p>
            `;


    document.getElementById("metricasFichaConteudo").innerHTML = `

        <!-- TOPO -->
        <div class="d-flex justify-content-between align-items-center gap-3 mb-3">

            <div>

                <span class="badge bg-${
                    client.priority.level === "Alta"
                        ? "danger"
                        : client.priority.level === "Média"
                            ? "warning text-dark"
                            : "success"
                }">
                    ${mtSeguro(client.priority.level)}
                </span>

                <span class="ms-2 text-secondary">
                    ${mtSeguro(client.priority.reason)}
                </span>

                <span class="ms-2 badge bg-primary">Score ${Number(client.reactivation_score?.score || 0)}/100</span>

            </div>

            <button
                id="mtEditarCadastro"
                class="btn btn-sm btn-outline-light"
            >
                <i class="bi bi-pencil me-1"></i>
                Editar cadastro em Clientes
            </button>

        </div>


        <!-- INFORMAÇÕES COMERCIAIS -->
        <div class="card metrics-panel mb-4">

            <div class="card-header">
                <strong>
                    Informações comerciais editáveis
                </strong>
            </div>

            <div class="card-body">

                <div class="row g-3">

                    <div class="col-md-4">

                        <label
                            class="form-label"
                            for="mtVendedor"
                        >
                            Vendedor responsável
                        </label>

                        <input
                            id="mtVendedor"
                            class="form-control"
                            list="mtVendedoresLista"
                            value="${mtSeguro(client.seller || "")}"
                            placeholder="Digite ou escolha"
                        >

                        <datalist id="mtVendedoresLista">
                            <option>Alisson</option>
                            <option>Noberto</option>
                            <option>Aldener</option>
                            <option>Letícia</option>
                            <option>Clayton</option>
                            <option>Outros</option>
                        </datalist>

                    </div>


                    <div class="col-md-4">

                        <label
                            class="form-label"
                            for="mtStatusComercial"
                        >
                            Status comercial
                        </label>

                        <div class="input-group">

                            <select
                                id="mtStatusComercial"
                                class="form-select"
                            >
                                ${commercialOptions}
                            </select>

                            <button
                                class="btn btn-outline-light"
                                type="button"
                                data-gerenciar-status="metrics"
                                title="Gerenciar opções"
                            >
                                <i class="bi bi-gear"></i>
                            </button>

                        </div>

                    </div>


                    <div class="col-md-4">

                        <label
                            class="form-label"
                            for="mtPrioridadeManual"
                        >
                            Prioridade
                        </label>

                        <select
                            id="mtPrioridadeManual"
                            class="form-select"
                        >

                            <option value="">
                                Automática (${
                                    mtSeguro(
                                        client.priority.automaticLevel ||
                                        client.priority.level
                                    )
                                })
                            </option>

                            ${["Alta", "Média", "Baixa"]
                                .map(item => `
                                    <option
                                        ${
                                            client.priority_override === item
                                                ? "selected"
                                                : ""
                                        }
                                    >
                                        ${item}
                                    </option>
                                `)
                                .join("")}

                        </select>

                    </div>


                    <div class="col-12">

                        <label
                            class="form-label"
                            for="mtPrioridadeNotas"
                        >
                            Motivo da prioridade manual
                        </label>

                        <input
                            id="mtPrioridadeNotas"
                            class="form-control"
                            value="${mtSeguro(client.priority_notes || "")}"
                            placeholder="Opcional; explique por que este cliente deve ter essa prioridade"
                        >

                    </div>


                    <div class="col-md-6">
                        <div class="client-detail">
                            <small>
                                Reativado em
                            </small>

                            <strong>
                                ${mtData(client.reactivated_at)}
                            </strong>
                        </div>
                    </div>


                    <div class="col-md-6">
                        <div class="client-detail">
                            <small>
                                Resultado financeiro
                            </small>

                            <strong>
                                ${mtMoeda(client.reactivation_result)}
                            </strong>
                        </div>
                    </div>

                </div>

            </div>

        </div>


        <!-- HISTÓRICO DE COMPRAS -->
        <div class="card metrics-panel mb-4">

            <div class="card-header">
                <strong>
                    Histórico de compras
                </strong>
            </div>

            <div class="card-body">
                ${mtGraficoCliente(client.metrics)}
                <form id="mtRegistrarCompra" class="row g-3 mt-3 pt-3 border-top">
                    <div class="col-md-3">
                        <label class="form-label" for="mtCompraData">Data da compra</label>
                        <input id="mtCompraData" class="form-control" type="date" required>
                    </div>
                    <div class="col-md-3">
                        <label class="form-label" for="mtCompraValor">Valor</label>
                        <input id="mtCompraValor" class="form-control" inputmode="decimal" placeholder="0,00" required>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label" for="mtCompraItens">Itens</label>
                        <input id="mtCompraItens" class="form-control" placeholder="Ex.: compressor, filtro e fluido" required>
                    </div>
                    <div class="col-md-9">
                        <label class="form-label" for="mtCompraObservacao">Observação</label>
                        <input id="mtCompraObservacao" class="form-control" placeholder="Opcional">
                    </div>
                    <div class="col-md-3 d-flex align-items-end">
                        <button class="btn btn-primary w-100" type="submit">Adicionar compra</button>
                    </div>
                </form>
                <div class="table-responsive mt-4">
                    <table class="table table-dark table-sm align-middle mb-0">
                        <thead><tr><th>Data</th><th>Itens</th><th>Valor</th><th>Observação</th></tr></thead>
                        <tbody>${client.purchases?.length ? client.purchases.map(purchase => `<tr><td>${mtData(purchase.movement_date)}</td><td>${mtSeguro(purchase.items || "Compra importada")}</td><td>${mtMoeda(purchase.value)}</td><td>${mtSeguro(purchase.notes || "—")}</td></tr>`).join("") : '<tr><td colspan="4" class="text-center text-secondary py-3">Nenhuma compra registrada.</td></tr>'}</tbody>
                    </table>
                </div>
            </div>

        </div>


        <div class="row g-4">


            <!-- FLUXO DE REATIVAÇÃO -->
            <div class="col-lg-6">

                <div class="card metrics-panel h-100">

                    <div class="card-header">
                        <strong>
                            Fluxo de reativação
                        </strong>
                    </div>

                    <div class="card-body">

                        <div class="row g-3">


                            <!-- ETAPA DO FUNIL -->
                            <div class="col-md-6">

                                <label
                                    class="form-label"
                                    for="mtReativacaoStatus"
                                >
                                    Etapa do funil
                                </label>

                                <div class="input-group">

                                    <select
                                        id="mtReativacaoStatus"
                                        class="form-select"
                                    >
                                        ${statusOptions}
                                    </select>

                                    <button
                                        class="btn btn-outline-light"
                                        type="button"
                                        data-gerenciar-status="reactivation"
                                        title="Gerenciar etapas"
                                    >
                                        <i class="bi bi-gear"></i>
                                    </button>

                                </div>

                            </div>


                            <!-- ÚLTIMA COMPRA -->
                            <div class="col-md-6">

                                <label
                                    class="form-label"
                                    for="mtUltimaCompra"
                                >
                                    Última compra
                                </label>

                                <input
                                    id="mtUltimaCompra"
                                    class="form-control"
                                    type="date"
                                    value="${mtSeguro(String(client.last_movement_at || "").slice(0, 10))}"
                                >

                            </div>


                            <!-- MOTIVO -->
                            <div class="col-12">

                                <label
                                    class="form-label"
                                    for="mtMotivoInatividade"
                                >
                                    Motivo da inatividade
                                </label>

                                <input
                                    id="mtMotivoInatividade"
                                    class="form-control"
                                    list="mtMotivosLista"
                                    value="${mtSeguro(client.inactivity_reason || "")}"
                                    placeholder="Digite qualquer motivo"
                                >

                                <datalist id="mtMotivosLista">
                                    <option>Não identificado</option>
                                    <option>Preço</option>
                                    <option>Sem demanda</option>
                                    <option>Comprando de concorrente</option>
                                    <option>Parou de trabalhar na área</option>
                                    <option>Atendimento</option>
                                    <option>Estoque</option>
                                </datalist>

                            </div>


                            <!-- OBSERVAÇÕES -->
                            <div class="col-12">

                                <label
                                    class="form-label"
                                    for="mtNotasReativacao"
                                >
                                    Observações operacionais
                                </label>

                                <textarea
                                    id="mtNotasReativacao"
                                    class="form-control"
                                    rows="3"
                                >${mtSeguro(client.reactivation_notes || "")}</textarea>

                            </div>


                            <!-- PRODUTOS -->
                            <div class="col-md-6">

                                <label
                                    class="form-label"
                                    for="mtProdutosPrincipais"
                                >
                                    Principais produtos
                                </label>

                                <textarea
                                    id="mtProdutosPrincipais"
                                    class="form-control"
                                    rows="2"
                                >${mtSeguro(client.main_products || "")}</textarea>

                            </div>


                            <div class="col-md-6">

                                <label
                                    class="form-label"
                                    for="mtUltimosProdutos"
                                >
                                    Últimos produtos
                                </label>

                                <textarea
                                    id="mtUltimosProdutos"
                                    class="form-control"
                                    rows="2"
                                >${mtSeguro(client.latest_products || "")}</textarea>

                            </div>


                            <!-- INFORMAÇÕES ADICIONAIS -->
                            <div class="col-12">

                                <label
                                    class="form-label"
                                    for="mtNotasMetricas"
                                >
                                    Informações adicionais do cliente
                                </label>

                                <textarea
                                    id="mtNotasMetricas"
                                    class="form-control"
                                    rows="3"
                                >${mtSeguro(client.metric_notes || "")}</textarea>

                            </div>


                            <!-- SALVAR -->
                            <div class="col-12">

                                <button
                                    id="mtSalvarOperacao"
                                    class="btn btn-success"
                                >
                                    Salvar todas as informações
                                </button>

                            </div>

                        </div>

                    </div>

                </div>

            </div>


            <!-- REGISTRAR CONTATO -->
            <div class="col-lg-6">

                <div class="card metrics-panel h-100">

                    <div class="card-header">
                        <strong>
                            Registrar contato
                        </strong>
                    </div>

                    <div class="card-body">

                        <div class="row g-3">


                            <div class="col-md-6">

                                <label
                                    class="form-label"
                                    for="mtContatoTipo"
                                >
                                    Canal
                                </label>

                                <select
                                    id="mtContatoTipo"
                                    class="form-select"
                                >
                                    <option value="whatsapp">WhatsApp</option>
                                    <option value="ligacao">Ligação</option>
                                    <option value="visita">Visita</option>
                                    <option value="email">E-mail</option>
                                </select>

                            </div>


                            <div class="col-md-6">

                                <label
                                    class="form-label"
                                    for="mtContatoResultado"
                                >
                                    Responsável
                                </label>

                                <input
                                    id="mtContatoResponsavel"
                                    class="form-control"
                                    placeholder="Quem realizou o contato"
                                    value="${mtSeguro(client.seller || "")}"
                                    required
                                >

                            </div>
                            <div class="col-md-6"><label class="form-label" for="mtContatoStatus">Status resultante</label><select id="mtContatoStatus" class="form-select">${statusOptions}</select></div>
                            <div class="col-12 form-check form-switch ms-2">
                                <input class="form-check-input" type="checkbox" role="switch" id="mtContatoAgendarRetorno" checked>
                                <label class="form-check-label" for="mtContatoAgendarRetorno">Agendar retorno para este cliente</label>
                            </div>
                            <div class="col-md-6" id="mtContatoAcaoArea"><label class="form-label" for="mtContatoAcao">Próxima ação</label><input id="mtContatoAcao" class="form-control" placeholder="Ex.: enviar proposta" required></div>


                            <div class="col-12">

                                <label
                                    class="form-label"
                                    for="mtContatoNotas"
                                >
                                    Observação
                                </label>

                                <textarea
                                    id="mtContatoNotas"
                                    class="form-control"
                                    rows="2"
                                ></textarea>

                            </div>


                            <div class="col-md-7" id="mtContatoProximoArea">

                                <label
                                    class="form-label"
                                    for="mtContatoProximo"
                                >
                                    Agendar retorno
                                </label>

                                <input
                                    id="mtContatoProximo"
                                    class="form-control"
                                    type="date"
                                    value="${mtSeguro(String(client.next_contact_at || "").slice(0, 10))}"
                                    required
                                >

                            </div>


                            <div class="col-md-5 d-flex align-items-end">

                                <button
                                    id="mtRegistrarContato"
                                    class="btn btn-outline-light w-100"
                                >
                                    Registrar contato
                                </button>

                            </div>

                        </div>

                        <hr>

                        <div class="reactivation-history">
                            ${contacts}
                        </div>

                    </div>

                </div>

            </div>

        </div>
    `;


    document.getElementById("mtEditarCadastro").onclick = () => {
        bootstrap.Modal
            .getInstance(document.getElementById("modalFichaMetricas"))
            ?.hide();

        window.sessionStorage.setItem(
            "abrirFichaCliente",
            String(id)
        );

        Router.carregarPagina("clientes");
    };


    document
        .querySelectorAll("[data-gerenciar-status]")
        .forEach(button => {
            button.onclick = () =>
                mtGerenciarStatus(
                    button.dataset.gerenciarStatus,
                    id
                );
        });


    document.getElementById("mtSalvarOperacao").onclick = async event => {
        const botao = event.currentTarget;
        const conteudoOriginal = botao.innerHTML;

        botao.disabled = true;
        botao.innerHTML = `
            <span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
            Salvando...
        `;

        try {
            const payload = {
                seller:
                    document.getElementById("mtVendedor").value,

                metric_status:
                    document.getElementById("mtStatusComercial").value,

                priority_override:
                    document.getElementById("mtPrioridadeManual").value,

                priority_notes:
                    document.getElementById("mtPrioridadeNotas").value,

                ...(document.getElementById("mtReativacaoStatus").value
                    ? { reactivation_status: document.getElementById("mtReativacaoStatus").value }
                    : {}),

                last_movement_at:
                    document.getElementById("mtUltimaCompra").value,

                inactivity_reason:
                    document.getElementById("mtMotivoInatividade").value,

                reactivation_notes:
                    document.getElementById("mtNotasReativacao").value,

                main_products:
                    document.getElementById("mtProdutosPrincipais").value,

                latest_products:
                    document.getElementById("mtUltimosProdutos").value,

                metric_notes:
                    document.getElementById("mtNotasMetricas").value
            };
            const saved = await mtJson(
                `/api/customer-metrics/clients/${id}?compact=1`,
                {
                    method: "PUT",

                    headers: {
                        "Content-Type": "application/json"
                    },

                    body: JSON.stringify(payload)
                }
            );

            const cached = metricasClientesCache.find(item => String(item.id) === String(id));
            if (cached) Object.assign(cached, saved);
            mtRenderTable();

            mtMostrarAviso("Informações salvas com sucesso.");
        } catch (error) {
            mtMostrarAviso(
                error.message || "Não foi possível salvar as informações.",
                "danger"
            );
        } finally {
            const botaoAtual = document.getElementById("mtSalvarOperacao");

            if (botaoAtual) {
                botaoAtual.disabled = false;
                botaoAtual.innerHTML = conteudoOriginal;
            }
        }
    };


    const atualizarAgendamentoContatoMetricas = () => {
        const agendar = document.getElementById("mtContatoAgendarRetorno");
        const acao = document.getElementById("mtContatoAcao");
        const proximo = document.getElementById("mtContatoProximo");
        if (!agendar || !acao || !proximo) return;
        acao.required = agendar.checked;
        acao.disabled = !agendar.checked;
        proximo.required = agendar.checked;
        proximo.disabled = !agendar.checked;
        document.getElementById("mtContatoAcaoArea")?.classList.toggle("opacity-50", !agendar.checked);
        document.getElementById("mtContatoProximoArea")?.classList.toggle("opacity-50", !agendar.checked);
    };
    document.getElementById("mtContatoAgendarRetorno").checked = Boolean(client.next_contact_at);
    atualizarAgendamentoContatoMetricas();
    document.getElementById("mtContatoAgendarRetorno").onchange = atualizarAgendamentoContatoMetricas;

    document.getElementById("mtRegistrarContato").onclick = async event => {
        const button = event.currentTarget;
        const fields = {
            responsible: document.getElementById("mtContatoResponsavel").value.trim(),
            resulting_status: document.getElementById("mtContatoStatus").value,
            next_action: document.getElementById("mtContatoAcao").value.trim(),
            notes: document.getElementById("mtContatoNotas").value.trim(),
            schedule_return: document.getElementById("mtContatoAgendarRetorno").checked,
            next_contact_at: document.getElementById("mtContatoProximo").value
        };
        if (!fields.responsible || !fields.notes || (fields.schedule_return && (!fields.next_action || !fields.next_contact_at))) {
            mtMostrarAviso(fields.schedule_return
                ? "Preencha responsável, próxima ação, observação e data de retorno."
                : "Preencha responsável e observação.", "danger");
            return;
        }
        button.disabled = true;
        try {
            await mtJson(
            `/api/reactivation/clients/${id}/contacts`,
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    kind:
                        document.getElementById("mtContatoTipo").value,

                    responsible: fields.responsible,
                    resulting_status: fields.resulting_status,
                    next_action: fields.next_action,
                    notes: fields.notes,
                    schedule_return: fields.schedule_return,
                    next_contact_at: fields.next_contact_at
                })
            }
            );
            mtMostrarAviso("Contato registrado no histórico.");
            await carregarMetricasClientes();
            await mtAbrirCliente(id);
        } catch (error) {
            mtMostrarAviso(error.message || "Não foi possível registrar o contato.", "danger");
        } finally {
            if (document.body.contains(button)) button.disabled = false;
        }
    };

    document.getElementById("mtRegistrarCompra").onsubmit = async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const button = form.querySelector("button[type='submit']");
        button.disabled = true;
        try {
            await mtJson(`/api/customer-metrics/clients/${id}/purchases`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    date: document.getElementById("mtCompraData").value,
                    value: document.getElementById("mtCompraValor").value,
                    items: document.getElementById("mtCompraItens").value,
                    notes: document.getElementById("mtCompraObservacao").value
                })
            });
            mtMostrarAviso("Compra adicionada ao histórico e às métricas.");
            await carregarMetricasClientes();
            await mtAbrirCliente(id);
        } catch (error) {
            mtMostrarAviso(error.message || "Não foi possível adicionar a compra.", "danger");
        } finally {
            if (document.body.contains(button)) button.disabled = false;
        }
    };


    bootstrap.Modal
        .getOrCreateInstance(
            document.getElementById("modalFichaMetricas")
        )
        .show();
}


async function mtFilePayload(file) {
    const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });

    return { filename: file.name, base64 };
}


function mtGerenciarStatus() {
    bootstrap.Modal
        .getInstance(document.getElementById("modalFichaMetricas"))
        ?.hide();
    Router.carregarPagina("configuracoes");
}


window.inicializarMetricasClientes = async () => {
    metricasStatus = await mtJson(
        "/api/customer-metrics/status-options/metrics"
    );

    const filtro = document.getElementById("metricasStatusFiltro");
    filtro.innerHTML =
        '<option value="todos">Todos</option>' +
        metricasStatus
            .map(item => `<option>${mtSeguro(item.name)}</option>`)
            .join("");

    mtAtualizarRecortes();
    await carregarMetricasClientes();

    document
        .getElementById("metricasPreset")
        .addEventListener("change", mtAtualizarRecortes);
    document
        .getElementById("btnAplicarMetricas")
        .addEventListener("click", carregarMetricasClientes);

    [
        "metricasStatusFiltro",
        "metricasPrioridadeFiltro",
        "metricasOrdenacao"
    ].forEach(id => {
        document.getElementById(id).addEventListener("change", mtRenderTable);
    });

    document
        .getElementById("metricasPesquisa")
        .addEventListener("input", event => {
            metricasPesquisa = event.target.value.trim().toLowerCase();
            mtRenderTable();
        });

    ["metricasTabela", "metricasFilaHoje"].forEach(id => {
        document.getElementById(id).addEventListener("click", event => {
            const target = event.target.closest("[data-cliente-metrica]");
            if (target) {
                mtAbrirCliente(target.dataset.clienteMetrica)
                    .catch(error => alert(error.message));
            }
        });
    });

    document
        .getElementById("btnPreverMetricas")
        .addEventListener("click", async () => {
            try {
                const file = document.getElementById("arquivoMetricas").files[0];
                if (!file) throw new Error("Selecione um relatório.");

                metricasArquivo = await mtFilePayload(file);
                const preview = await mtJson(
                    "/api/customer-metrics/imports/preview",
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(metricasArquivo)
                    }
                );

                document.getElementById("metricasImportStatus").innerHTML = `
                    <div class="alert alert-info mb-0">
                        <strong>
                            ${mtSeguro(preview.period.type)}:
                            ${mtData(preview.period.start)} a ${mtData(preview.period.end)}
                        </strong>
                        <br>
                        ${preview.total} clientes, ${preview.newCustomers} novos e
                        ${mtMoeda(preview.totalValue)} em compras.
                    </div>
                `;
                document.getElementById("btnImportarMetricas").disabled = false;
            } catch (error) {
                document.getElementById("metricasImportStatus").innerHTML = `
                    <div class="alert alert-danger mb-0">
                        ${mtSeguro(error.message)}
                    </div>
                `;
            }
        });

    document
        .getElementById("btnImportarMetricas")
        .addEventListener("click", async () => {
            try {
                const result = await mtJson(
                    "/api/customer-metrics/imports",
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(metricasArquivo)
                    }
                );

                alert(`Relatório importado: ${result.total} clientes.`);
                bootstrap.Modal
                    .getInstance(document.getElementById("modalImportarMetricas"))
                    ?.hide();
                await carregarMetricasClientes();
            } catch (error) {
                alert(error.message);
            }
        });
};
