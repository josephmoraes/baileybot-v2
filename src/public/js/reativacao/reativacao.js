const REATIVACAO_VENDEDORES = [
  "Todos os Clientes",
  "Alisson",
  "Noberto",
  "Aldener",
  "Letícia",
  "Clayton",
  "Outros",
];
const REATIVACAO_STATUS = [
  "Último Contato",
  "Entrar em contato",
  "Contatado",
  "Avulso",
  "Recente",
  "Aguardando",
  "Sem Contato",
  "Não ligar",
  "-",
];
let reativacaoFiltro = "Alisson";
let reativacaoVendedorGlobal = "todos";
let reativacaoStatusFiltro = "todos";
let reativacaoTags = [];
let reativacaoTagsFiltro = new Set();
let reativacaoSemEtiqueta = false;
let reativacaoArquivo = null;
let reativacaoOrdenacao = { campo: "recent", direcao: "desc" };
const REATIVACAO_COLUNAS = [
  { id: "code", label: "Código", classe: "col-code" },
  { id: "client", label: "Cliente", classe: "col-client" },
  { id: "phone", label: "Telefone", classe: "col-phone" },
  { id: "seller", label: "Responsável", classe: "col-seller" },
  { id: "movement", label: "Última movimentação", classe: "col-movement" },
  { id: "lastValue", label: "Valor da última", classe: "col-last-value" },
  { id: "accumulated", label: "Valor acumulado", classe: "col-accumulated" },
  { id: "status", label: "Status", classe: "col-status" },
  { id: "tags", label: "Etiquetas", classe: "col-tags" },
  { id: "nextContact", label: "Próximo contato", classe: "col-next-contact" },
];
const REATIVACAO_COLUNAS_PADRAO = [
  "code",
  "client",
  "movement",
  "accumulated",
  "status",
  "nextContact",
];
let reativacaoColunasVisiveis = (() => {
  try {
    const salvas = JSON.parse(
      window.localStorage.getItem("baileybot_reactivation_columns") || "null",
    );
    return new Set(
      Array.isArray(salvas) && salvas.length
        ? salvas
        : REATIVACAO_COLUNAS_PADRAO,
    );
  } catch {
    return new Set(REATIVACAO_COLUNAS_PADRAO);
  }
})();

const rcSeguro = (valor) =>
  String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const rcMoeda = (valor) =>
  Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
const rcData = (valor) =>
  valor
    ? new Date(`${String(valor).slice(0, 10)}T12:00:00`).toLocaleDateString(
        "pt-BR",
      )
    : "—";
const rcTelefone = (jid) =>
  String(jid || "")
    .replace("@s.whatsapp.net", "")
    .replace(/^55/, "");
const rcMascaraTelefone = (valor) => {
  const numeros = String(valor || "")
    .replace(/\D/g, "")
    .slice(0, 11);
  if (numeros.length <= 2) return numeros ? `(${numeros}` : "";
  if (numeros.length <= 6)
    return `(${numeros.slice(0, 2)}) ${numeros.slice(2)}`;
  const corte = numeros.length === 11 ? 7 : 6;
  return `(${numeros.slice(0, 2)}) ${numeros.slice(2, corte)}-${numeros.slice(corte)}`;
};
const rcMascaraData = (valor) => {
  const numeros = String(valor || "")
    .replace(/\D/g, "")
    .slice(0, 8);
  return [numeros.slice(0, 2), numeros.slice(2, 4), numeros.slice(4, 8)]
    .filter(Boolean)
    .join("/");
};
const rcCompletarData = (valor) => {
  const numeros = String(valor || "").replace(/\D/g, "");
  if (!numeros) return "";
  if (numeros.length === 4) return rcMascaraData(`${numeros}2026`);
  if (numeros.length === 6)
    return rcMascaraData(`${numeros.slice(0, 4)}20${numeros.slice(4)}`);
  return rcMascaraData(numeros);
};
const rcDataFormulario = (valor) => {
  const partes = String(valor || "")
    .slice(0, 10)
    .split("-");
  return partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : "";
};
const rcFormatarReal = (valor) => {
  if (valor === "" || valor === null || valor === undefined) return "";
  if (typeof valor === "number")
    return valor.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  const limpo = String(valor)
    .replace(/R\$\s*/i, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  const numero = Number(limpo);
  return Number.isFinite(numero)
    ? numero.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "";
};
const rcClasseStatus = (status) =>
  ({
    "Entrar em contato": "status-entrar-contato",
    Contatado: "status-contatado",
    Avulso: "status-avulso",
    Recente: "status-recente",
    Aguardando: "status-aguardando",
    "Sem Contato": "status-sem-contato",
    "Não ligar": "status-nao-ligar",
    "-": "status-indefinido",
  })[status] || "status-indefinido";

async function rcJson(url, opcoes) {
  const resposta = await fetch(url, opcoes);
  const dados = await resposta.json();
  if (!resposta.ok)
    throw new Error(dados.error || "Não foi possível concluir a operação.");
  return dados;
}

function rcBarra(item, maior) {
  const largura = maior ? Math.max(4, (item.total / maior) * 100) : 0;
  return `<div class="reactivation-bar"><div class="d-flex justify-content-between"><span>${rcSeguro(item.label || "Sem status")}</span><strong>${item.total}</strong></div><div class="progress"><div class="progress-bar bg-success" style="width:${largura}%"></div></div></div>`;
}

async function inicializarReativacaoResumo() {
  document
    .querySelector("[data-page-link]")
    ?.addEventListener("click", (evento) =>
      Router.carregarPagina(evento.currentTarget.dataset.pageLink),
    );
  try {
    const dados = await rcJson("/api/reactivation/dashboard");
    document.getElementById("reativacaoTotal").textContent = dados.total;
    document.getElementById("reativacaoVendedores").textContent =
      dados.porVendedor.length;
    document.getElementById("reativacaoContatosSemana").textContent =
      dados.contatos.semana;
    document.getElementById("reativacaoContatosHoje").textContent =
      dados.contatos.hoje;
    const maiorStatus = Math.max(
      ...dados.porStatus.map((item) => item.total),
      0,
    );
    const maiorVendedor = Math.max(
      ...dados.porVendedor.map((item) => item.total),
      0,
    );
    document.getElementById("reativacaoGraficoStatus").innerHTML = dados
      .porStatus.length
      ? dados.porStatus.map((item) => rcBarra(item, maiorStatus)).join("")
      : '<div class="dashboard-empty">Nenhum cliente importado.</div>';
    document.getElementById("reativacaoGraficoVendedor").innerHTML = dados
      .porVendedor.length
      ? dados.porVendedor.map((item) => rcBarra(item, maiorVendedor)).join("")
      : '<div class="dashboard-empty">Nenhum vendedor encontrado.</div>';
    document.getElementById("reativacaoPrioridades").innerHTML = dados
      .prioritarios.length
      ? dados.prioritarios
          .map(
            (item, indice) =>
              `<tr><td><span class="commission-rank">${indice + 1}</span></td><td><strong>${rcSeguro(item.customer)}</strong><small class="d-block text-secondary">${rcSeguro(item.customer_code)}</small></td><td>${rcSeguro(item.seller || "Sem vendedor")}</td><td>${rcData(item.last_movement_at)}</td><td>${item.days_without_purchase}</td><td>${rcMoeda(item.accumulated_value)}</td></tr>`,
          )
          .join("")
      : '<tr><td colspan="6" class="text-center text-secondary py-4">Importe clientes com data e valor acumulado para gerar prioridades.</td></tr>';
  } catch (erro) {
    alert(erro.message);
  }
}

async function inicializarReativacaoVendedores() {
  reativacaoTags = await rcJson("/api/reactivation/tags");
  document.getElementById("rcStatus").innerHTML = REATIVACAO_STATUS.map(
    (status) => `<option>${status}</option>`,
  ).join("");
  document.getElementById("reativacaoFiltroStatus").innerHTML = [
    '<option value="todos">Todos os status</option>',
    ...REATIVACAO_STATUS.map(
      (status) => `<option value="${rcSeguro(status)}">${rcSeguro(status)}</option>`,
    ),
  ].join("");
  const tabs = document.getElementById("reativacaoVendedorTabs");
  tabs.innerHTML = REATIVACAO_VENDEDORES.map(
    (nome) =>
      `<button class="btn ${nome === reativacaoFiltro ? "btn-success" : "btn-outline-secondary"}" data-vendedor="${rcSeguro(nome)}">${rcSeguro(nome)}</button>`,
  ).join("");
  tabs.addEventListener("click", async (evento) => {
    const botao = evento.target.closest("[data-vendedor]");
    if (!botao) return;
    reativacaoFiltro = botao.dataset.vendedor;
    tabs
      .querySelectorAll("button")
      .forEach(
        (item) =>
          (item.className = `btn ${item === botao ? "btn-success" : "btn-outline-secondary"}`),
      );
    atualizarFiltrosGlobaisReativacao();
    await carregarClientesReativacao();
  });
  document.getElementById("reativacaoFiltroVendedor").addEventListener("change", async (evento) => {
    reativacaoVendedorGlobal = evento.target.value;
    await carregarClientesReativacao();
  });
  document.getElementById("reativacaoFiltroStatus").addEventListener("change", async (evento) => {
    reativacaoStatusFiltro = evento.target.value;
    await carregarClientesReativacao();
  });
  let atraso;
  document
    .getElementById("reativacaoPesquisa")
    .addEventListener("input", () => {
      clearTimeout(atraso);
      atraso = setTimeout(carregarClientesReativacao, 250);
    });
  document
    .getElementById("btnNovoClienteReativacao")
    .addEventListener("click", () => abrirClienteReativacao());
  document
    .getElementById("formClienteReativacao")
    .addEventListener("submit", salvarClienteReativacao);
  document
    .getElementById("btnCriarEtiqueta")
    .addEventListener("click", criarEtiquetaReativacao);
  document
    .getElementById("btnRegistrarContato")
    .addEventListener("click", registrarContatoReativacao);
  document.getElementById("reativacaoFiltrosEtiquetas").innerHTML = reativacaoTags
    .map((tag) => `<label class="form-check"><input class="form-check-input" type="checkbox" value="${tag.id}"> <span class="form-check-label"><span class="badge" style="background:${rcSeguro(tag.color)}">${rcSeguro(tag.name)}</span></span></label>`)
    .join("");
  document.querySelectorAll("#reativacaoFiltrosEtiquetas input").forEach((input) => input.addEventListener("change", async () => {
    if (input.checked) reativacaoTagsFiltro.add(Number(input.value));
    else reativacaoTagsFiltro.delete(Number(input.value));
    reativacaoSemEtiqueta = false;
    document.getElementById("reativacaoFiltroSemEtiqueta").checked = false;
    document.getElementById("reativacaoTagsFiltroTotal").textContent = reativacaoTagsFiltro.size;
    await carregarClientesReativacao();
  }));
  document.getElementById("reativacaoFiltroSemEtiqueta").addEventListener("change", async (evento) => {
    reativacaoSemEtiqueta = evento.target.checked;
    if (reativacaoSemEtiqueta) {
      reativacaoTagsFiltro.clear();
      document.querySelectorAll("#reativacaoFiltrosEtiquetas input").forEach((input) => { input.checked = false; });
    }
    document.getElementById("reativacaoTagsFiltroTotal").textContent = reativacaoSemEtiqueta ? "1" : "0";
    await carregarClientesReativacao();
  });
  document.getElementById("reativacaoLimparEtiquetas").addEventListener("click", async () => {
    reativacaoTagsFiltro.clear(); reativacaoSemEtiqueta = false;
    document.querySelectorAll("#reativacaoFiltrosEtiquetas input, #reativacaoFiltroSemEtiqueta").forEach((input) => { input.checked = false; });
    document.getElementById("reativacaoTagsFiltroTotal").textContent = "0";
    await carregarClientesReativacao();
  });
  inicializarSeletorColunasReativacao();
  atualizarFiltrosGlobaisReativacao();
  document.getElementById("rcTelefone").addEventListener("input", (evento) => {
    evento.target.value = rcMascaraTelefone(evento.target.value);
  });
  document.querySelectorAll(".reactivation-date-input").forEach((input) => {
    input.addEventListener("input", (evento) => {
      evento.target.value = rcMascaraData(evento.target.value);
    });
    input.addEventListener("blur", (evento) => {
      evento.target.value = rcCompletarData(evento.target.value);
    });
  });
  document.querySelectorAll(".reactivation-money-input").forEach((input) =>
    input.addEventListener("blur", (evento) => {
      evento.target.value = rcFormatarReal(evento.target.value);
    }),
  );
  document.querySelectorAll("[data-seller-suggestion]").forEach((botao) =>
    botao.addEventListener("click", () => {
      document.getElementById("rcVendedor").value =
        botao.dataset.sellerSuggestion;
      document
        .querySelectorAll("[data-seller-suggestion]")
        .forEach((item) => item.classList.toggle("active", item === botao));
    }),
  );
  document.querySelectorAll("[data-sort]").forEach((botao) =>
    botao.addEventListener("click", async () => {
      const mesmoCampo = reativacaoOrdenacao.campo === botao.dataset.sort;
      reativacaoOrdenacao = {
        campo: botao.dataset.sort,
        direcao:
          mesmoCampo && reativacaoOrdenacao.direcao === "asc" ? "desc" : "asc",
      };
      document.querySelectorAll("[data-sort]").forEach((item) => {
        item.classList.toggle("active", item === botao);
        const icone = item.querySelector("i");
        if (icone)
          icone.className =
            item === botao
              ? `bi bi-sort-${reativacaoOrdenacao.direcao === "asc" ? "up" : "down"}`
              : "bi bi-arrow-down-up";
      });
      await carregarClientesReativacao();
    }),
  );
  await carregarClientesReativacao();
}

async function carregarClientesReativacao() {
  const pesquisa = document.getElementById("reativacaoPesquisa")?.value || "";
  const visaoGlobal = reativacaoFiltro === "Todos os Clientes";
  const seller = visaoGlobal
    ? reativacaoVendedorGlobal
    : reativacaoFiltro === "Outros"
      ? "outros"
      : reativacaoFiltro;
  const tags = reativacaoSemEtiqueta ? "none" : [...reativacaoTagsFiltro].join(",");
  const clientes = await rcJson(
    `/api/reactivation/clients?seller=${encodeURIComponent(seller)}&status=${encodeURIComponent(visaoGlobal ? reativacaoStatusFiltro : "todos")}&search=${encodeURIComponent(pesquisa)}&sort=${encodeURIComponent(reativacaoOrdenacao.campo)}&direction=${reativacaoOrdenacao.direcao}&tags=${encodeURIComponent(tags)}`,
  );
  document
    .querySelectorAll(".reactivation-responsavel")
    .forEach((item) =>
      item.classList.toggle("d-none", !visaoGlobal && reativacaoFiltro !== "Outros"),
    );
  document.getElementById("reativacaoContagem").textContent =
    `${clientes.length} cliente(s)`;
  document.getElementById("reativacaoClientes").innerHTML = clientes.length
    ? clientes
        .map(
          (cliente) =>
            `<tr data-id="${cliente.id}"><td class="col-code">${rcSeguro(cliente.customer_code)}</td><td class="col-client"><button class="btn btn-link text-light p-0 text-start" data-abrir="${cliente.id}"><strong>${rcSeguro(cliente.company_name || cliente.name)}</strong></button>${cliente.company_name && cliente.name ? `<small class="d-block text-secondary">${rcSeguro(cliente.name)}</small>` : ""}</td><td class="col-phone">${rcSeguro(rcMascaraTelefone(rcTelefone(cliente.jid)))}</td><td class="col-seller reactivation-responsavel ${!visaoGlobal && reativacaoFiltro !== "Outros" ? "d-none" : ""}">${rcSeguro(cliente.seller || "Sem vendedor")}</td><td class="col-movement">${rcData(cliente.last_movement_at)}</td><td class="col-last-value">${rcMoeda(cliente.last_movement_value)}</td><td class="col-accumulated"><strong>${rcMoeda(cliente.accumulated_value)}</strong></td><td class="col-status"><select class="form-select form-select-sm reactivation-status ${rcClasseStatus(cliente.reactivation_status)}" data-status="${cliente.id}" aria-label="Status de ${rcSeguro(cliente.company_name || cliente.name)}">${REATIVACAO_STATUS.map((status) => `<option ${status === cliente.reactivation_status ? "selected" : ""}>${status}</option>`).join("")}</select></td><td class="col-tags"><div class="d-flex flex-wrap gap-1">${cliente.tags.map((tag) => `<span class="badge" style="background:${rcSeguro(tag.color)}">${rcSeguro(tag.name)}</span>`).join("") || "—"}</div></td><td class="col-next-contact">${rcData(cliente.next_contact_at)}</td><td class="col-actions"><button class="btn btn-sm btn-outline-light" data-abrir="${cliente.id}" title="Abrir cliente"><i class="bi bi-pencil"></i></button></td></tr>`,
        )
        .join("")
    : `<tr><td colspan="11" class="text-center text-secondary py-5">Nenhum cliente encontrado para ${rcSeguro(reativacaoFiltro)}.</td></tr>`;
  document
    .querySelectorAll("[data-abrir]")
    .forEach((botao) =>
      botao.addEventListener("click", () =>
        abrirClienteReativacao(botao.dataset.abrir),
      ),
    );
  document.querySelectorAll("[data-status]").forEach((select) =>
    select.addEventListener("change", async () => {
      try {
        await rcJson(
          `/api/reactivation/clients/${select.dataset.status}/status`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: select.value }),
          },
        );
        select.className = `form-select form-select-sm reactivation-status ${rcClasseStatus(select.value)}`;
      } catch (erro) {
        alert(erro.message);
        await carregarClientesReativacao();
      }
    }),
  );
  aplicarColunasReativacao();
}

function atualizarFiltrosGlobaisReativacao() {
  document
    .getElementById("reativacaoFiltrosGlobais")
    ?.classList.toggle("d-none", reativacaoFiltro !== "Todos os Clientes");
}

function inicializarSeletorColunasReativacao() {
  const container = document.getElementById("reativacaoColumnOptions");
  container.innerHTML = REATIVACAO_COLUNAS.map(
    (coluna) =>
      `<label class="reactivation-column-option"><input type="checkbox" value="${coluna.id}" ${reativacaoColunasVisiveis.has(coluna.id) ? "checked" : ""}><span>${coluna.label}</span></label>`,
  ).join("");
  container.addEventListener("change", (evento) => {
    if (!evento.target.matches("input[type='checkbox']")) return;
    if (evento.target.checked)
      reativacaoColunasVisiveis.add(evento.target.value);
    else reativacaoColunasVisiveis.delete(evento.target.value);
    if (!reativacaoColunasVisiveis.size) {
      reativacaoColunasVisiveis.add("client");
      container.querySelector("input[value='client']").checked = true;
    }
    salvarColunasReativacao();
  });
  document
    .getElementById("btnColunasPadrao")
    .addEventListener("click", () =>
      definirColunasReativacao(REATIVACAO_COLUNAS_PADRAO),
    );
  document
    .getElementById("btnTodasColunas")
    .addEventListener("click", () =>
      definirColunasReativacao(REATIVACAO_COLUNAS.map((coluna) => coluna.id)),
    );
  aplicarColunasReativacao();
}

function definirColunasReativacao(colunas) {
  reativacaoColunasVisiveis = new Set(colunas);
  document
    .querySelectorAll("#reativacaoColumnOptions input")
    .forEach((input) => {
      input.checked = reativacaoColunasVisiveis.has(input.value);
    });
  salvarColunasReativacao();
}

function salvarColunasReativacao() {
  window.localStorage.setItem(
    "baileybot_reactivation_columns",
    JSON.stringify([...reativacaoColunasVisiveis]),
  );
  aplicarColunasReativacao();
}

function aplicarColunasReativacao() {
  const visaoGlobal = reativacaoFiltro === "Todos os Clientes";
  REATIVACAO_COLUNAS.forEach((coluna) =>
    document.querySelectorAll(`.${coluna.classe}`).forEach((elemento) => {
      const ocultar =
        (!reativacaoColunasVisiveis.has(coluna.id) && !(visaoGlobal && coluna.id === "seller")) ||
        (coluna.id === "seller" && !visaoGlobal && reativacaoFiltro !== "Outros");
      elemento.classList.toggle("column-hidden", ocultar);
    }),
  );
  const totalEfetivo = [...reativacaoColunasVisiveis].filter(
    (id) => id !== "seller" || visaoGlobal || reativacaoFiltro === "Outros",
  ).length + (visaoGlobal && !reativacaoColunasVisiveis.has("seller") ? 1 : 0);
  document
    .querySelector(".reactivation-table")
    ?.classList.toggle("many-columns", totalEfetivo > 6);
  const botao = document.getElementById("btnColunasReativacao");
  if (botao) botao.title = `${totalEfetivo} coluna(s) visível(is)`;
}

function renderizarTagsReativacao(selecionadas = []) {
  document.getElementById("rcEtiquetas").innerHTML = reativacaoTags
    .map(
      (tag) =>
        `<label class="reactivation-tag-choice"><input type="checkbox" value="${tag.id}" ${selecionadas.includes(tag.id) ? "checked" : ""}><span style="--tag-color:${rcSeguro(tag.color)}">${rcSeguro(tag.name)}</span></label>`,
    )
    .join("");
}

async function abrirClienteReativacao(id = null) {
  document.getElementById("formClienteReativacao").reset();
  document.getElementById("reativacaoClienteId").value = id || "";
  renderizarTagsReativacao([]);
  document.getElementById("rcHistoricoArea").classList.toggle("d-none", !id);
  if (id) {
    const cliente = await rcJson(`/api/reactivation/clients/${id}`);
    document.getElementById("rcCodigo").value = cliente.customer_code || "";
    document.getElementById("rcEmpresa").value = cliente.company_name || "";
    document.getElementById("rcNome").value = cliente.name || "";
    document.getElementById("rcTelefone").value = rcMascaraTelefone(
      rcTelefone(cliente.jid),
    );
    document.getElementById("rcVendedor").value = cliente.seller || "";
    document.getElementById("rcStatus").value =
      cliente.reactivation_status || "Sem Contato";
    document.getElementById("rcUltimaData").value = rcDataFormulario(
      cliente.last_movement_at,
    );
    document.getElementById("rcUltimoValor").value = rcFormatarReal(
      cliente.last_movement_value,
    );
    document.getElementById("rcAcumulado").value = rcFormatarReal(
      cliente.accumulated_value,
    );
    document.getElementById("rcProximoContato").value = rcDataFormulario(
      cliente.next_contact_at,
    );
    document.getElementById("rcObservacao").value =
      cliente.reactivation_notes || "";
    renderizarTagsReativacao(cliente.tags.map((tag) => tag.id));
    renderizarHistoricoReativacao(cliente.contacts);
  }
  bootstrap.Modal.getOrCreateInstance(
    document.getElementById("modalClienteReativacao"),
  ).show();
}

async function salvarClienteReativacao(evento) {
  evento.preventDefault();
  const id = document.getElementById("reativacaoClienteId").value;
  const dados = {
    customer_code: document.getElementById("rcCodigo").value,
    company_name: document.getElementById("rcEmpresa").value,
    name: document.getElementById("rcNome").value,
    telefone: document.getElementById("rcTelefone").value,
    seller: document.getElementById("rcVendedor").value,
    reactivation_status: document.getElementById("rcStatus").value,
    last_movement_at: document.getElementById("rcUltimaData").value,
    last_movement_value: document.getElementById("rcUltimoValor").value,
    accumulated_value: document.getElementById("rcAcumulado").value,
    next_contact_at: document.getElementById("rcProximoContato").value,
    reactivation_notes: document.getElementById("rcObservacao").value,
    tag_ids: [...document.querySelectorAll("#rcEtiquetas input:checked")].map(
      (input) => Number(input.value),
    ),
  };
  try {
    await rcJson(
      id ? `/api/reactivation/clients/${id}` : "/api/reactivation/clients",
      {
        method: id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dados),
      },
    );
    bootstrap.Modal.getInstance(
      document.getElementById("modalClienteReativacao"),
    ).hide();
    await carregarClientesReativacao();
  } catch (erro) {
    alert(erro.message);
  }
}

function renderizarHistoricoReativacao(contatos) {
  document.getElementById("rcHistorico").innerHTML = contatos.length
    ? contatos
        .map(
          (item) =>
            `<div class="reactivation-history-item"><div><strong>${rcSeguro(item.kind)}</strong><small>${new Date(item.contacted_at).toLocaleString("pt-BR")}</small></div><p>${rcSeguro(item.notes || "Sem observação")}</p>${item.next_contact_at ? `<span>Próximo: ${rcData(item.next_contact_at)}</span>` : ""}</div>`,
        )
        .join("")
    : '<div class="text-secondary small">Nenhum contato registrado.</div>';
}
async function registrarContatoReativacao() {
  const id = document.getElementById("reativacaoClienteId").value;
  if (!id) return;
  try {
    await rcJson(`/api/reactivation/clients/${id}/contacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: document.getElementById("rcContatoTipo").value,
        notes: document.getElementById("rcContatoObs").value,
        next_contact_at: rcCompletarData(
          document.getElementById("rcContatoProximo").value,
        ),
      }),
    });
    await abrirClienteReativacao(id);
  } catch (erro) {
    alert(erro.message);
  }
}
async function criarEtiquetaReativacao() {
  try {
    const tag = await rcJson("/api/reactivation/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: document.getElementById("rcNovaEtiqueta").value,
        color: document.getElementById("rcNovaEtiquetaCor").value,
      }),
    });
    reativacaoTags.push(tag);
    renderizarTagsReativacao([
      tag.id,
      ...[...document.querySelectorAll("#rcEtiquetas input:checked")].map(
        (input) => Number(input.value),
      ),
    ]);
    document.getElementById("rcNovaEtiqueta").value = "";
  } catch (erro) {
    alert(erro.message);
  }
}

async function arquivoBase64Reativacao() {
  const arquivo = document.getElementById("arquivoReativacao").files[0];
  if (!arquivo) throw new Error("Selecione um arquivo.");
  const base64 = await new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result).split(",")[1]);
    leitor.onerror = reject;
    leitor.readAsDataURL(arquivo);
  });
  return { base64, filename: arquivo.name };
}
async function preverImportacaoReativacao() {
  try {
    reativacaoArquivo = await arquivoBase64Reativacao();
    const dados = await rcJson("/api/reactivation/imports/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reativacaoArquivo),
    });
    document.getElementById("previaReativacao").innerHTML =
      `<div class="row g-2 text-center"><div class="col"><div class="reactivation-preview"><strong>${dados.total}</strong><small>Linhas</small></div></div><div class="col"><div class="reactivation-preview"><strong>${dados.novos}</strong><small>Novos</small></div></div><div class="col"><div class="reactivation-preview"><strong>${dados.atualizacoes}</strong><small>Atualizar</small></div></div><div class="col"><div class="reactivation-preview"><strong>${dados.invalidos}</strong><small>Inválidos</small></div></div></div><div class="table-responsive mt-3"><table class="table table-dark table-sm"><thead><tr><th>Código</th><th>Cliente</th><th>Vendedor</th><th>Ação</th></tr></thead><tbody>${dados.amostra.map((item) => `<tr><td>${rcSeguro(item.customer_code || "—")}</td><td>${rcSeguro(item.company_name || item.name || "—")}</td><td>${rcSeguro(item.seller || "—")}</td><td>${rcSeguro(item.acao)}</td></tr>`).join("")}</tbody></table></div>`;
    document.getElementById("btnConfirmarImportacao").disabled =
      !dados.novos && !dados.atualizacoes;
  } catch (erro) {
    alert(erro.message);
  }
}
async function confirmarImportacaoReativacao() {
  if (!reativacaoArquivo) return;
  try {
    const dados = await rcJson("/api/reactivation/imports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reativacaoArquivo),
    });
    alert(
      `Importação concluída: ${dados.novos} novo(s), ${dados.atualizados} atualizado(s), ${dados.invalidos} inválido(s).`,
    );
    bootstrap.Modal.getInstance(
      document.getElementById("modalImportarReativacao"),
    ).hide();
    await carregarClientesReativacao();
  } catch (erro) {
    alert(erro.message);
  }
}
