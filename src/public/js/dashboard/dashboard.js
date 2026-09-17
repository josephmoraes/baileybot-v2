const dashboardFormatador = new Intl.NumberFormat("pt-BR");
const dashboardMoeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dashboardPendencies = [
  ["highPriorityNoContact", "Clientes de prioridade Alta sem contato", "bi-person-exclamation", { priority: "Alta", status: "Não contatado" }],
  ["awaitingReturn", "Aguardando retorno", "bi-hourglass-split", { status: "Aguardando retorno" }],
  ["todayReturns", "Retornos de hoje", "bi-calendar-event", { returnFilter: "today" }],
  ["overdueReturns", "Retornos atrasados", "bi-calendar-x", { returnFilter: "overdue" }],
  ["negotiations", "Clientes em negociação", "bi-chat-square-text", { status: "Negociação" }],
  ["recentlyReactivated", "Reativados recentemente", "bi-arrow-repeat", { status: "Reativado", reactivatedRecently: true }],
  ["pendingCreditRequests", "Solicitações de crédito pendentes", "bi-file-earmark-text", { creditPending: true }]
];
function dashboardNumero(id, value) { const el = document.getElementById(id); if (el) el.textContent = dashboardFormatador.format(value || 0); }
function renderizarPendencias(pending) {
  const container = document.getElementById("dashboardPendencias");
  if (!container) return;
  container.innerHTML = dashboardPendencies.map(([key, label, icon, filter]) => `<button class="dashboard-pendency" data-dashboard-filter='${JSON.stringify(filter)}'><span class="dashboard-pendency-icon"><i class="bi ${icon}"></i></span><span><strong>${dashboardFormatador.format(pending[key] || 0)}</strong><small>${label}</small></span><i class="bi bi-chevron-right"></i></button>`).join("");
}
function abrirFiltroDashboard(filter) {
  if (filter.creditPending) { window.sessionStorage.setItem("baileyDashboardCreditFilter", "pending"); Router.carregarPagina("comissoes-solicitacao"); return; }
  window.sessionStorage.setItem("baileyDashboardReactivationFilter", JSON.stringify(filter));
  Router.carregarPagina("reativacao-vendedores");
}
async function carregarDashboard() {
  if (!document.querySelector(".dashboard-page")) return;
  try {
    const response = await fetch("/api/dashboard");
    if (!response.ok) throw new Error("Não foi possível carregar o dashboard.");
    const data = await response.json(); const summary = data.operational.summary;
    renderizarPendencias(data.operational.pending);
    dashboardNumero("dashClientesAtivos", summary.activeCustomers); dashboardNumero("dashClientesInativos", summary.inactiveCustomers);
    dashboardNumero("dashEmRisco", summary.atRisk); dashboardNumero("dashReativados", summary.reactivated);
    dashboardNumero("dashNegociacoes", summary.negotiations); dashboardNumero("dashRetornosPendentes", summary.pendingReturns);
    document.getElementById("dashFaturamento").textContent = dashboardMoeda.format(summary.revenue || 0);
    const variation = Number(summary.variation || 0); const variationEl = document.getElementById("dashVariacao");
    variationEl.textContent = `${variation >= 0 ? "+" : ""}${variation.toFixed(1)}% vs. período anterior`;
    variationEl.className = `small ${variation >= 0 ? "text-success" : "text-danger"}`;
    document.getElementById("dashboardAtualizado").textContent = `Atualizado às ${new Date(data.atualizadoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  } catch (error) { console.error("Erro ao carregar dashboard:", error); const updated = document.getElementById("dashboardAtualizado"); if (updated) updated.textContent = "Não foi possível atualizar"; }
}
document.addEventListener("click", event => {
  const filter = event.target.closest("[data-dashboard-filter]");
  if (filter && typeof Router !== "undefined") abrirFiltroDashboard(JSON.parse(filter.dataset.dashboardFilter));
  const action = event.target.closest("[data-dashboard-action]");
  if (!action || typeof Router === "undefined") return;
  if (action.dataset.dashboardAction === "metrics") Router.carregarPagina("metricas");
  if (action.dataset.dashboardAction === "reactivation") abrirFiltroDashboard({ priority: action.dataset.priority, status: action.dataset.status, returnFilter: action.dataset.returnFilter === "overdue" ? "pending" : action.dataset.returnFilter });
});
