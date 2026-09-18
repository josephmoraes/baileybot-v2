let clientesCache = [];
let clientesPagina = 1;
let clientesPaginas = 1;
let clientesPesquisaTimer = null;
let clientesTags = [];
let cliente360Atual = null;

function renderizarEtiquetasCliente(selecionadas = []) {
  const area = document.getElementById("clienteEtiquetas");
  if (!area) return;
  area.innerHTML = clientesTags
    .map(
      (tag) =>
        `<label class="reactivation-tag-choice"><input type="checkbox" value="${tag.id}" ${selecionadas.includes(tag.id) ? "checked" : ""}><span style="--tag-color:${fichaSeguro(tag.color)}">${fichaSeguro(tag.name)}</span></label>`,
    )
    .join("");
}

async function importarClientesExcel(arquivo) {
  if (!arquivo) return;
  const base64 = await new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result).split(",")[1]);
    leitor.onerror = () =>
      reject(new Error("Não foi possível ler a planilha."));
    leitor.readAsDataURL(arquivo);
  });
  const resposta = await fetch("/api/users/import-excel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base64, filename: arquivo.name }),
  });
  const dados = await resposta.json();
  if (!resposta.ok)
    throw new Error(dados.error || "Erro ao importar planilha.");
  alert(
    `Importação concluída: ${dados.importados} novo(s), ${dados.duplicados} duplicado(s), ${dados.invalidos} inválido(s).`,
  );
  await carregarClientes();
  await carregarDashboard();
}

async function carregarClientes(page = clientesPagina) {
  try {
    const busca = document.getElementById("pesquisaCliente")?.value || "";
    const parametros = new URLSearchParams({
      page,
      perPage: 50,
      search: busca,
      priority:
        document.getElementById("filtroClientePrioridade")?.value || "todos",
      status: document.getElementById("filtroClienteStatus")?.value || "todos",
      seller:
        document.getElementById("filtroClienteVendedor")?.value || "todos",
      active: document.getElementById("filtroClienteAtivo")?.value || "todos",
      minDays: document.getElementById("filtroClienteDiasMin")?.value || "",
      maxDays: document.getElementById("filtroClienteDiasMax")?.value || "",
      sort: document.getElementById("ordenacaoClientes")?.value || "az",
    });
    const resposta = await fetch(`/api/users?${parametros}`);
    const dados = await resposta.json();
    const clientes = dados.items;
    clientesCache = clientes;
    clientesPagina = dados.page;
    clientesPaginas = dados.pages;
    document.getElementById("clientesPaginacaoResumo").textContent =
      `${dados.total} cliente(s) • página ${dados.page} de ${dados.pages}`;
    document.getElementById("clientesPaginaAnterior").disabled =
      dados.page <= 1;
    document.getElementById("clientesPaginaProxima").disabled =
      dados.page >= dados.pages;
    [["filtroClienteStatus", dados.filters?.statuses]].forEach(
      ([id, options]) => {
        const select = document.getElementById(id);
        if (!select || select.dataset.loaded) return;
        select.insertAdjacentHTML(
          "beforeend",
          (options || [])
            .map(
              (option) =>
                `<option value="${fichaSeguro(option)}">${fichaSeguro(option)}</option>`,
            )
            .join(""),
        );
        select.dataset.loaded = "1";
      },
    );
    const filtroVendedor = document.getElementById("filtroClienteVendedor");
    if (filtroVendedor && !filtroVendedor.dataset.loaded) {
      const vendedoresResposta = await fetch("/api/settings/sellers");
      const vendedores = await vendedoresResposta.json();
      if (!vendedoresResposta.ok)
        throw new Error(
          vendedores.error || "Não foi possível carregar os vendedores.",
        );
      filtroVendedor.insertAdjacentHTML(
        "beforeend",
        vendedores
          .map(
            (vendedor) =>
              `<option value="${fichaSeguro(vendedor)}">${fichaSeguro(vendedor)}</option>`,
          )
          .join("") + '<option value="Sem vendedor">Sem vendedor</option>',
      );
      filtroVendedor.dataset.loaded = "1";
    }

    const tabela = document.getElementById("tabelaClientes");

    tabela.innerHTML = "";

    if (clientes.length === 0) {
      tabela.innerHTML = `
                <tr>
                    <td colspan="8" class="text-center text-secondary py-4">
                        Nenhum cliente cadastrado.
                    </td>
                </tr>
            `;

      return;
    }

    renderizarClientes(clientes);
  } catch (erro) {
    console.error(erro);
    alert(erro.message);
  }
}

function renderizarClientes(clientes) {
  const tabela = document.getElementById("tabelaClientes");

  tabela.innerHTML = "";

  if (clientes.length === 0) {
    tabela.innerHTML = `
            <tr>
                <td colspan="8" class="text-center text-secondary py-4">
                    Nenhum cliente encontrado.
                </td>
            </tr>
        `;

    return;
  }

  clientes.forEach((cliente) => {
    tabela.innerHTML += `
            <tr class="${cliente.active ? "" : "opacity-50"}">
                <td><button class="btn btn-link text-light p-0 text-decoration-none" onclick="abrirFichaCompletaCliente(${cliente.id})">${fichaSeguro(cliente.customer_code ?? "—")}</button></td>
                <td><button class="btn btn-link text-light p-0 text-decoration-none text-start" onclick="abrirFichaCompletaCliente(${cliente.id})">${fichaSeguro(cliente.company_name || cliente.name || "Nome não informado")}</button><small class="d-block text-secondary">${cliente.active ? "Ativo" : "Inativo"}</small></td>
                <td>${fichaSeguro(cliente.seller || "Sem vendedor")}</td>
                <td><span class="badge bg-${cliente.prioridade.level === "Alta" ? "danger" : cliente.prioridade.level === "Média" ? "warning text-dark" : "success"}">${fichaSeguro(cliente.prioridade.level)}</span></td>
                <td>${fichaSeguro(cliente.reactivation_status || "Não contatado")}</td>
                <td>${fichaMoeda(cliente.faturamento)}</td>
                <td>${cliente.diasSemComprar === null ? "—" : `${cliente.diasSemComprar} dias`}</td>
                <td>
                    <button
                        class="btn btn-sm btn-primary"
                        onclick='editarCliente(${JSON.stringify({ id: cliente.id, customer_code: cliente.customer_code, company_name: cliente.company_name, name: cliente.name, jid: cliente.jid, tags: cliente.tags })})'>
                        <i class="bi bi-pencil"></i>
                    </button>

                    <button
                        class="btn btn-sm btn-danger"
                        onclick="excluirCliente(${cliente.id})">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            </tr>
        `;
  });
}

function fichaMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function fichaData(valor) {
  if (!valor) return "—";
  return new Date(`${String(valor).slice(0, 10)}T12:00:00`).toLocaleDateString(
    "pt-BR",
  );
}

function fichaSeguro(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function fichaGrafico(serie) {
  if (!serie?.length)
    return '<div class="app-state py-4"><p class="mb-0">Sem movimentações reais para esta visão.</p></div>';
  const largura = Math.max(720, serie.length * 105);
  const altura = 260;
  const margem = 42;
  const valores = serie.map((item) => Number(item.value) || 0);
  const max = Math.max(1, ...valores);
  const min = Math.min(...valores);
  const pontos = serie.map((item, index) => ({
    ...item,
    x:
      margem + index * ((largura - margem * 2) / Math.max(1, serie.length - 1)),
    y: altura - margem - (Number(item.value) / max) * (altura - margem * 2),
  }));
  const maior = Math.max(...valores);
  const menor = Math.min(...valores);
  const variacoes = pontos.filter((item) => item.variation !== null);
  const crescimento = [...variacoes].sort(
    (a, b) => b.variation - a.variation,
  )[0];
  const queda = [...variacoes].sort((a, b) => a.variation - b.variation)[0];
  return `<div class="client-chart-highlights mb-3"><span><strong>Maior:</strong> ${fichaSeguro(pontos.find((item) => item.value === maior)?.label)} · ${fichaMoeda(maior)}</span><span><strong>Menor:</strong> ${fichaSeguro(pontos.find((item) => item.value === menor)?.label)} · ${fichaMoeda(menor)}</span>${crescimento?.variation > 0 ? `<span class="text-success"><strong>Crescimento:</strong> ${fichaSeguro(crescimento.label)} · +${crescimento.variation.toFixed(1)}%</span>` : ""}${queda?.variation < 0 ? `<span class="text-danger"><strong>Queda:</strong> ${fichaSeguro(queda.label)} · ${queda.variation.toFixed(1)}%</span>` : ""}</div><div class="client-line-chart"><svg viewBox="0 0 ${largura} ${altura}" role="img" aria-label="Evolução do faturamento"><polyline points="${pontos.map((item) => `${item.x},${item.y}`).join(" ")}" fill="none" stroke="#69b7ff" stroke-width="4" stroke-linejoin="round"/>${pontos.map((item) => `<g><circle cx="${item.x}" cy="${item.y}" r="6" fill="${item.value === maior ? "#20c997" : item.value === menor ? "#ffc107" : "#69b7ff"}"><title>${fichaSeguro(item.label)} · ${fichaMoeda(item.value)} · ${item.variation === null ? "sem período anterior" : `${item.variation.toFixed(1)}%`}</title></circle><text x="${item.x}" y="${altura - 12}" text-anchor="middle">${fichaSeguro(item.label)}</text><text x="${item.x}" y="${Math.max(16, item.y - 12)}" text-anchor="middle">${fichaMoeda(item.value)}</text></g>`).join("")}</svg></div>`;
}

async function carregarFichaCompletaCliente(id) {
  const modalElement = document.getElementById("modalFichaCliente");
  const conteudo =
    document.getElementById("cliente360Conteudo") ||
    document.getElementById("fichaClienteConteudo");
  if (!conteudo) return;
  if (modalElement) bootstrap.Modal.getOrCreateInstance(modalElement).show();
  conteudo.innerHTML =
    '<div class="text-center py-5"><span class="spinner-border"></span></div>';
  try {
    const response = await fetch(`/api/customer-metrics/clients/${id}`);
    const client = await response.json();
    if (!response.ok)
      throw new Error(client.error || "Não foi possível abrir o cliente.");
    cliente360Atual = client;
    const titulo =
      document.getElementById("cliente360Titulo") ||
      document.getElementById("fichaClienteTitulo");
    titulo.textContent =
      client.company_name || client.name || `Cliente ${client.customer_code}`;
    const phone = client.jid
      ? client.jid.replace("@s.whatsapp.net", "").replace(/^55/, "")
      : "—";
    const badge =
      client.priority.level === "Alta"
        ? "danger"
        : client.priority.level === "Média"
          ? "warning text-dark"
          : client.priority.level === "Baixa"
            ? "success"
            : "secondary";
    conteudo.innerHTML = `
          <div class="row g-3 mb-4">
            <div class="col-md-3"><div class="client-detail"><small>Código OG1</small><strong>${fichaSeguro(client.customer_code || "—")}</strong></div></div>
            <div class="col-md-5"><div class="client-detail"><small>Cliente / empresa</small><strong>${fichaSeguro(client.company_name || "Não informado")}</strong></div></div>
            <div class="col-md-4"><div class="client-detail"><small>Contato</small><strong>${fichaSeguro(client.name || "Não informado")}</strong></div></div>
            <div class="col-md-3"><div class="client-detail"><small>Telefone</small><strong>${fichaSeguro(phone)}</strong></div></div>
            <div class="col-md-3"><div class="client-detail"><small>Responsável</small><strong>${fichaSeguro(client.seller || "Outros")}</strong></div></div>
            <div class="col-md-3"><div class="client-detail"><small>Status de reativação</small><strong>${fichaSeguro(client.reactivation_status || "Não contatado")}</strong></div></div>
            <div class="col-md-3"><div class="client-detail"><small>Situação</small><strong>${client.active ? "Ativo" : "Inativo"}</strong></div></div>
            <div class="col-12"><div class="client-detail"><small>Etiquetas</small><div class="d-flex flex-wrap gap-1 mt-1">${(client.tags || []).map((tag) => `<span class="badge" style="background:${fichaSeguro(tag.color)}">${fichaSeguro(tag.name)}</span>`).join("") || "Sem etiquetas"}</div></div></div>
          </div>
          <div class="card bg-secondary text-light border-0 mb-4"><div class="card-body"><div class="d-flex flex-wrap justify-content-between gap-2"><div><small class="text-secondary">Prioridade comercial</small><h4><span class="badge bg-${badge}">${fichaSeguro(client.priority.level)}</span> <span class="small text-secondary">${client.priority.score}/100</span></h4></div><p class="mb-0 align-self-center">${fichaSeguro(client.priority.reason)}</p></div></div></div>
          <div class="row g-3 mb-4"><div class="col-lg-6"><div class="card bg-secondary text-light border-0 h-100"><div class="card-header"><strong>Produtos e anotações de métricas</strong></div><div class="card-body"><label for="fichaProdutosPrincipais" class="form-label">Principais produtos</label><textarea id="fichaProdutosPrincipais" class="form-control mb-3" rows="3">${fichaSeguro(client.main_products || "")}</textarea><label for="fichaProdutosUltimos" class="form-label">Últimos produtos comprados</label><textarea id="fichaProdutosUltimos" class="form-control mb-3" rows="3">${fichaSeguro(client.latest_products || "")}</textarea><label for="fichaNotasMetricas" class="form-label">Anotações sobre o cliente</label><textarea id="fichaNotasMetricas" class="form-control mb-3" rows="4" placeholder="Contatos, contexto e próximos passos...">${fichaSeguro(client.metric_notes || "")}</textarea><label for="fichaClienteAtivo" class="form-label">Situação do cliente</label><select id="fichaClienteAtivo" class="form-select mb-3"><option value="1" ${client.active ? "selected" : ""}>Ativo</option><option value="0" ${client.active ? "" : "selected"}>Inativo</option></select><button class="btn btn-success" type="button" onclick="salvarProdutosCliente(${client.id})">Salvar informações</button></div></div></div><div class="col-lg-6"><div class="card bg-secondary text-light border-0 h-100"><div class="card-header"><strong>Informações de reativação</strong></div><div class="card-body"><p><small class="text-secondary d-block">Última movimentação</small>${fichaData(client.last_movement_at)} — ${fichaMoeda(client.last_movement_value)}</p><p><small class="text-secondary d-block">Valor acumulado</small>${fichaMoeda(client.accumulated_value)}</p><p class="mb-0"><small class="text-secondary d-block">Observação</small>${fichaSeguro(client.reactivation_notes || "Sem observação")}</p></div></div></div></div>
          <div class="row g-3 mb-4">${[
            ["Última compra", fichaData(client.analytics.ultimaCompra)],
            ["Dias sem comprar", client.analytics.diasSemComprar ?? "—"],
            ["Ticket médio", fichaMoeda(client.analytics.ticketMedio)],
            ["Faturamento", fichaMoeda(client.analytics.faturamento)],
            [
              "Frequência média",
              client.analytics.frequenciaMediaDias === null
                ? "—"
                : `${client.analytics.frequenciaMediaDias} dias`,
            ],
            [
              "Quantidade de compras",
              Number(client.analytics.compras).toLocaleString("pt-BR"),
            ],
          ]
            .map(
              ([label, value]) =>
                `<div class="col-md-4 col-xl-2"><div class="client-detail"><small>${label}</small><strong>${value}</strong></div></div>`,
            )
            .join("")}</div>
          <div class="card bg-secondary text-light border-0 mb-4"><div class="card-header d-flex flex-wrap justify-content-between gap-2"><strong>Movimentações reais</strong><div class="btn-group btn-group-sm"><button class="btn btn-outline-light active" data-chart-view="monthly">Mensal</button><button class="btn btn-outline-light" data-chart-view="quarterly">Trimestral</button><button class="btn btn-outline-light" data-chart-view="annual">Anual</button></div></div><div id="cliente360Grafico" class="card-body">${fichaGrafico(client.analytics.series.monthly)}</div></div>
          <div class="card bg-secondary text-light border-0 mb-4"><div class="card-header"><strong>Compras e movimentações reais</strong></div><div class="table-responsive"><table class="table table-dark mb-0"><thead><tr><th>Data</th><th>Movimento</th><th>Vendedor</th><th>Valor</th><th>Itens / observação</th><th>Origem</th></tr></thead><tbody>${client.purchases.length ? client.purchases.map((item) => `<tr><td>${fichaData(item.movement_date)}</td><td>${fichaSeguro(item.movement_number || "—")}</td><td>${fichaSeguro(item.seller || "—")}</td><td>${fichaMoeda(item.value)}</td><td>${fichaSeguro([item.items, item.notes].filter(Boolean).join(" · ") || "—")}</td><td>${fichaSeguro(item.source_module === "manual" ? "Manual" : item.source_module)}</td></tr>`).join("") : '<tr><td colspan="6" class="text-center text-secondary py-4">Sem movimentações registradas.</td></tr>'}</tbody></table></div></div>
          <div class="row g-3 mb-4"><div class="col-lg-6"><div class="card bg-secondary text-light border-0 h-100"><div class="card-header"><strong>Créditos</strong></div><div class="table-responsive"><table class="table table-dark mb-0"><thead><tr><th>Movimento</th><th>Venda</th><th>Crédito</th><th>Status</th></tr></thead><tbody>${client.credits.length ? client.credits.map((item) => `<tr><td>${fichaSeguro(item.movement || "—")}</td><td>${fichaMoeda(item.sale_value)}</td><td>${Number(item.credit).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td><td>${fichaSeguro(item.status)}</td></tr>`).join("") : '<tr><td colspan="4" class="text-center text-secondary py-4">Sem créditos.</td></tr>'}</tbody></table></div></div></div><div class="col-lg-6"><div class="card bg-secondary text-light border-0 h-100"><div class="card-header"><strong>Solicitações e documentos</strong></div><div class="table-responsive"><table class="table table-dark mb-0"><thead><tr><th>Número</th><th>Data</th><th>Créditos</th><th>Status</th><th>Documento</th></tr></thead><tbody>${client.requests.length ? client.requests.map((item) => `<tr><td>${fichaSeguro(item.number || "Rascunho")}</td><td>${fichaData(item.request_date)}</td><td>${Number(item.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td><td>${fichaSeguro(item.status)}</td><td>${item.document_url ? `<a class="btn btn-sm btn-outline-light" href="${fichaSeguro(item.document_url)}" target="_blank" rel="noopener">PDF</a>` : "—"}</td></tr>`).join("") : '<tr><td colspan="5" class="text-center text-secondary py-4">Sem solicitações.</td></tr>'}</tbody></table></div></div></div></div>
          <div class="card bg-secondary text-light border-0 mb-3"><div class="card-header"><strong>Score de reativação: ${Number(client.reactivation_score?.score || 0)}/100</strong></div><div class="card-body">${client.reactivation_score?.factors?.length ? client.reactivation_score.factors.map((item) => `<p class="mb-2"><strong>${fichaSeguro(item.label)}:</strong> ${fichaSeguro(item.value)} (${item.points > 0 ? "+" : ""}${item.points} pontos)</p>`).join("") : '<p class="mb-0">Sem dados suficientes para apontar fatores.</p>'}</div></div><div class="card bg-secondary text-light border-0"><div class="card-header"><strong>Histórico comercial</strong></div><div class="card-body">${client.commercial_history.length ? client.commercial_history.map((item) => `<div class="reactivation-history-item mb-2"><strong>${fichaSeguro(item.title || item.type)}</strong><small>${fichaData(item.date)}</small><p class="mb-0">${fichaSeguro(item.notes || item.result || "Sem observação")}</p>${item.responsible ? `<span>${fichaSeguro(item.responsible)} · ${fichaSeguro(item.resulting_status || "")}</span>` : ""}${item.next_action ? `<span>Próxima ação: ${fichaSeguro(item.next_action)} · ${fichaData(item.next_contact_at)}</span>` : ""}</div>`).join("") : '<p class="text-secondary mb-0">Sem histórico comercial.</p>'}</div></div>`;
    conteudo.querySelectorAll("[data-chart-view]").forEach((button) =>
      button.addEventListener("click", () => {
        conteudo
          .querySelectorAll("[data-chart-view]")
          .forEach((item) => item.classList.remove("active"));
        button.classList.add("active");
        document.getElementById("cliente360Grafico").innerHTML = fichaGrafico(
          cliente360Atual.analytics.series[button.dataset.chartView],
        );
      }),
    );
  } catch (error) {
    conteudo.innerHTML = `<div class="alert alert-danger">${fichaSeguro(error.message)}</div>`;
  }
}

function abrirFichaCompletaCliente(id) {
  window.sessionStorage.setItem("cliente360Id", String(id));
  location.hash = `#/clientes/360/${id}`;
}

function inicializarCliente360() {
  const id = Number(
    location.hash.match(/^#\/clientes\/360\/(\d+)$/)?.[1] ||
      window.sessionStorage.getItem("cliente360Id"),
  );
  if (!id)
    return (document.getElementById("cliente360Conteudo").innerHTML =
      '<div class="alert alert-warning">Selecione um cliente na lista.</div>');
  carregarFichaCompletaCliente(id);
}

window.inicializarCliente360 = inicializarCliente360;

async function salvarProdutosCliente(id) {
  try {
    const response = await fetch(`/api/customer-metrics/clients/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        main_products: document.getElementById("fichaProdutosPrincipais").value,
        latest_products: document.getElementById("fichaProdutosUltimos").value,
        metric_notes: document.getElementById("fichaNotasMetricas").value,
        active: document.getElementById("fichaClienteAtivo")?.value === "1",
        metric_status:
          document.getElementById("fichaStatusMetricas")?.value || undefined,
      }),
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error || "Não foi possível salvar os produtos.");
    alert("Informações salvas na ficha do cliente.");
    await carregarFichaCompletaCliente(id);
  } catch (error) {
    alert(error.message);
  }
}

async function salvarCliente() {
  const customer_code = document.getElementById("customer_code").value.trim();
  const company_name = document.getElementById("company_name").value.trim();
  const name = document.getElementById("name").value.trim();
  const telefone = document.getElementById("telefone").value.trim();
  const tag_ids = [
    ...document.querySelectorAll("#clienteEtiquetas input:checked"),
  ].map((input) => Number(input.value));

  if (!customer_code && !company_name && !name) {
    alert("Informe o código, o nome ou a empresa do cliente.");
    return;
  }

  const telefoneNumeros = telefone.replace(/\D/g, "");

  if (telefone && ![10, 11].includes(telefoneNumeros.length)) {
    alert(
      "Informe o DDD e o telefone completo: 10 dígitos para residencial ou 11 para celular.",
    );
    return;
  }

  try {
    const url = clienteEditando
      ? `/api/users/${clienteEditando}`
      : "/api/users";

    const metodo = clienteEditando ? "PUT" : "POST";

    const resposta = await fetch(url, {
      method: metodo,

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        customer_code,
        company_name,
        name,
        telefone,
        tag_ids,
      }),
    });

    if (!resposta.ok) {
      const erro = await resposta.json();

      if (erro.error?.includes("UNIQUE")) {
        throw new Error("Telefone já cadastrado.");
      }

      throw new Error(erro.error);
    }

    // Fecha o modal
    bootstrap.Modal.getInstance(document.getElementById("modalCliente")).hide();

    // Limpa os campos
    document.getElementById("customer_code").value = "";
    document.getElementById("company_name").value = "";
    document.getElementById("name").value = "";
    document.getElementById("telefone").value = "";
    renderizarEtiquetasCliente([]);

    // Notificação
    alert(
      metodo === "POST"
        ? "Cliente cadastrado com sucesso."
        : "Cliente atualizado com sucesso.",
    );

    // Sai do modo edição
    clienteEditando = null;

    // Atualiza a tabela e os cards
    await carregarClientes();
    await carregarDashboard();
  } catch (erro) {
    console.error(erro);
    alert(erro.message);
  }
}

function editarCliente(cliente) {
  clienteEditando = cliente.id;

  document.getElementById("customer_code").value = cliente.customer_code ?? "";

  document.getElementById("company_name").value = cliente.company_name ?? "";

  document.getElementById("name").value = cliente.name ?? "";

  document.getElementById("telefone").value = cliente.jid
    ? cliente.jid.replace("@s.whatsapp.net", "").replace(/^55/, "")
    : "";
  renderizarEtiquetasCliente((cliente.tags || []).map((tag) => tag.id));

  const modal = new bootstrap.Modal(document.getElementById("modalCliente"));

  modal.show();
}

async function excluirCliente(id) {
  console.log("Excluir cliente:", id);

  const confirmar = confirm(
    "Tem certeza que deseja excluir este cliente?\n\nEssa ação não pode ser desfeita.",
  );

  if (!confirmar) return;

  try {
    const resposta = await fetch(`/api/users/${id}`, {
      method: "DELETE",
    });

    console.log("Status:", resposta.status);

    if (!resposta.ok) {
      const erro = await resposta.json();
      throw new Error(erro.error);
    }

    await carregarClientes();
    await carregarDashboard();

    alert("Cliente excluído com sucesso.");
  } catch (erro) {
    console.error(erro);
    alert(erro.message);
  }
}

function aplicarMascaraTelefone() {
  const campo = document.getElementById("telefone");

  if (!campo) return;

  campo.addEventListener("input", (e) => {
    let valor = e.target.value.replace(/\D/g, "");

    valor = valor.substring(0, 11);

    if (valor.length > 10) {
      // Celular: (00) 00000-0000
      valor = valor.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, "($1) $2-$3");
    } else if (valor.length > 6) {
      // Residencial: (00) 0000-0000
      valor = valor.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, "($1) $2-$3");
    } else if (valor.length > 2) {
      valor = valor.replace(/^(\d{2})(\d+)/, "($1) $2");
    } else if (valor.length > 0) {
      valor = valor.replace(/^(\d+)/, "($1");
    }

    e.target.value = valor;
  });
}

async function inicializarClientes() {
  try {
    const respostaTags = await fetch("/api/reactivation/tags");
    clientesTags = await respostaTags.json();
    if (!respostaTags.ok)
      throw new Error(
        clientesTags.error || "Não foi possível carregar as etiquetas.",
      );
    renderizarEtiquetasCliente([]);
  } catch (erro) {
    console.error(erro);
  }

  const btnSalvar = document.getElementById("btnSalvarCliente");

  if (btnSalvar) {
    btnSalvar.removeEventListener("click", salvarCliente);
    btnSalvar.addEventListener("click", salvarCliente);
  }

  const pesquisa = document.getElementById("pesquisaCliente");

  if (pesquisa) {
    pesquisa.addEventListener("input", () => {
      clearTimeout(clientesPesquisaTimer);
      clientesPesquisaTimer = setTimeout(() => carregarClientes(1), 250);
    });
  }

  [
    "filtroClientePrioridade",
    "filtroClienteStatus",
    "filtroClienteVendedor",
    "filtroClienteAtivo",
    "ordenacaoClientes",
  ].forEach((id) =>
    document
      .getElementById(id)
      ?.addEventListener("change", () => carregarClientes(1)),
  );
  ["filtroClienteDiasMin", "filtroClienteDiasMax"].forEach((id) =>
    document.getElementById(id)?.addEventListener("input", () => {
      clearTimeout(clientesPesquisaTimer);
      clientesPesquisaTimer = setTimeout(() => carregarClientes(1), 250);
    }),
  );
  document
    .getElementById("limparFiltrosClientes")
    ?.addEventListener("click", () => {
      [
        "pesquisaCliente",
        "filtroClienteDiasMin",
        "filtroClienteDiasMax",
      ].forEach((id) => {
        document.getElementById(id).value = "";
      });
      [
        "filtroClientePrioridade",
        "filtroClienteStatus",
        "filtroClienteVendedor",
        "filtroClienteAtivo",
      ].forEach((id) => {
        document.getElementById(id).value = "todos";
      });
      document.getElementById("ordenacaoClientes").value = "az";
      carregarClientes(1);
    });

  aplicarMascaraTelefone();

  const campoArquivo = document.getElementById("arquivoClientesExcel");
  document
    .getElementById("btnImportarClientes")
    ?.addEventListener("click", () => campoArquivo?.click());
  campoArquivo?.addEventListener("change", async () => {
    try {
      await importarClientesExcel(campoArquivo.files?.[0]);
    } catch (erro) {
      alert(erro.message);
    } finally {
      campoArquivo.value = "";
    }
  });
  document
    .getElementById("btnExportarClientes")
    ?.addEventListener("click", () => {
      window.location.href = "/api/users/export-excel";
    });
  document
    .getElementById("clientesPaginaAnterior")
    ?.addEventListener("click", () =>
      carregarClientes(Math.max(1, clientesPagina - 1)),
    );
  document
    .getElementById("clientesPaginaProxima")
    ?.addEventListener("click", () =>
      carregarClientes(Math.min(clientesPaginas, clientesPagina + 1)),
    );

  const pendingClient = window.sessionStorage.getItem("abrirFichaCliente");
  if (pendingClient) {
    window.sessionStorage.removeItem("abrirFichaCliente");
    abrirFichaCompletaCliente(Number(pendingClient));
  }
}
