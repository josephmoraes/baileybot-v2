const relatorioEscape = (value) =>
  String(value ?? "").replace(
    /[&<>\"]/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char],
  );
const relatorioData = (value) =>
  value
    ? new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString(
        "pt-BR",
      )
    : "—";
const relatorioMoeda = (value) =>
  Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
const relatorioFiltro = (prefixo) =>
  new URLSearchParams({
    start: document.getElementById(`${prefixo}Inicio`).value,
    end: document.getElementById(`${prefixo}Fim`).value,
    seller: document.getElementById(`${prefixo}Vendedor`).value,
  });
async function relatorioJson(url) {
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok)
    throw new Error(body.error || "Não foi possível gerar o relatório.");
  return body;
}
function preencherVendedores(ids, vendedores) {
  ids.forEach((id) =>
    document
      .getElementById(id)
      .insertAdjacentHTML(
        "beforeend",
        vendedores
          .map(
            (nome) =>
              `<option value="${relatorioEscape(nome)}">${relatorioEscape(nome)}</option>`,
          )
          .join(""),
      ),
  );
}
async function carregarAcompanhamento() {
  const summary = await relatorioJson(
    `/api/reports/acompanhamento?${relatorioFiltro("acompanhamento").toString()}`,
  );
  document.getElementById("relatorioCards").innerHTML = summary.cards
    .map(
      (card) =>
        `<div class="col-sm-6 col-xl-3"><button type="button" class="dashboard-kpi h-100 w-100 text-start border-0 relatorio-card" data-card="${card.id}"><div><small class="text-secondary">${relatorioEscape(card.label)}</small><strong>${relatorioEscape(card.value)}</strong><small class="d-block text-secondary mt-1">${relatorioEscape(card.detail)}</small></div></button></div>`,
    )
    .join("");
}
function detalharLinhas(report) {
  if (!report.rows.length)
    return '<p class="text-secondary">Nenhum registro neste filtro.</p>';
  return `<div class="table-responsive"><table class="table table-dark table-hover align-middle"><thead><tr><th>Cliente</th><th>Vendedor</th><th>Detalhe</th></tr></thead><tbody>${report.rows.map((row) => `<tr><td>${relatorioEscape(row.customer || row.customer_code || "Cliente")}</td><td>${relatorioEscape(row.seller || "Outros")}</td><td>${row.priority ? `${relatorioEscape(row.priority.level)} · ${relatorioMoeda(row.period_value)}` : `${relatorioEscape(row.type)}${row.detail ? ` · ${relatorioEscape(row.detail)}` : ""}`}</td></tr>`).join("")}</tbody></table></div>`;
}
async function abrirCard(card) {
  const query = relatorioFiltro("acompanhamento");
  query.set("card", card);
  const report = await relatorioJson(`/api/reports/acompanhamento?${query}`);
  document.getElementById("detalheAcompanhamentoTitulo").textContent =
    report.title;
  document.getElementById("detalheAcompanhamentoConteudo").innerHTML =
    detalharLinhas(report);
  document.getElementById("detalheAcompanhamentoPdf").onclick = () =>
    window.open(`/api/reports/acompanhamento/pdf?${query}`, "_blank");
  bootstrap.Modal.getOrCreateInstance(
    document.getElementById("modalDetalheAcompanhamento"),
  ).show();
}
window.inicializarRelatorios = async () => {
  const today = new Date();
  const start = new Date();
  start.setDate(today.getDate() - 29);
  ["acompanhamento", "exportar"].forEach((prefixo) => {
    document.getElementById(`${prefixo}Fim`).value = today
      .toISOString()
      .slice(0, 10);
    document.getElementById(`${prefixo}Inicio`).value = start
      .toISOString()
      .slice(0, 10);
  });
  const sellers = await relatorioJson("/api/settings/sellers");
  preencherVendedores(["acompanhamentoVendedor", "exportarVendedor"], sellers);
  const atualizarFiltrosExportacao = () => {
    const tipo = document.getElementById("exportarTipo").value;
    document
      .getElementById("grupoExportarPrioridade")
      .classList.toggle("d-none", tipo !== "prioridades");
    document
      .getElementById("grupoExportarCreditos")
      .classList.toggle("d-none", tipo !== "comissoes-tecnicos");
    document
      .getElementById("grupoExportarVendedor")
      .classList.toggle(
        "d-none",
        ["comissoes-tecnicos", "baixas-creditos"].includes(tipo),
      );
  };
  document.getElementById("exportarTipo").onchange = atualizarFiltrosExportacao;
  atualizarFiltrosExportacao();
  document.getElementById("acompanhamentoAplicar").onclick = () =>
    carregarAcompanhamento().catch((error) => alert(error.message));
  document.getElementById("exportarPdf").onclick = () => {
    const query = relatorioFiltro("exportar");
    const tipo = document.getElementById("exportarTipo").value;
    if (tipo === "prioridades")
      query.set(
        "priority",
        document.getElementById("exportarPrioridade").value,
      );
    if (tipo === "comissoes-tecnicos") {
      const status = [
        ...document.querySelectorAll("[data-exportar-status-credito]:checked"),
      ].map((input) => input.value);
      if (!status.length)
        return alert("Selecione ao menos uma situação de crédito.");
      query.set("credit_statuses", status.join(","));
    }
    window.open(`/api/reports/${tipo}/pdf?${query}`, "_blank");
  };
  document.getElementById("relatorioCards").onclick = (event) => {
    const card = event.target.closest("[data-card]")?.dataset.card;
    if (card) abrirCard(card).catch((error) => alert(error.message));
  };
  await carregarAcompanhamento();
};
