let metricasClientesCache = [];
let metricasArquivo = null;
let metricasStatus = [];
const mtSeguro = valor => String(valor ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const mtMoeda = valor => Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const mtPercentual = valor => `${Number(valor || 0) >= 0 ? "+" : ""}${Number(valor || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const mtData = valor => valor ? new Date(`${valor}T12:00:00`).toLocaleDateString("pt-BR") : "—";
async function mtJson(url, options) { const response = await fetch(url, options); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Não foi possível concluir a operação."); return data; }

function mtAtualizarRecortes() {
  const preset = document.getElementById("metricasPreset").value;
  const select = document.getElementById("metricasRecorte");
  const opcoes = preset === "quarter" ? [["1-3", "1º trimestre"], ["4-6", "2º trimestre"], ["7-9", "3º trimestre"], ["10-12", "4º trimestre"]]
    : preset === "semester" ? [["1-6", "1º semestre"], ["7-12", "2º semestre"]] : [["1-12", "Ano completo"]];
  select.innerHTML = opcoes.map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
  select.disabled = preset === "custom";
  document.getElementById("metricasDatasPersonalizadas").classList.toggle("d-none", preset !== "custom");
}

function mtParametros() {
  const yearA = document.getElementById("metricasAnoA").value; const yearB = document.getElementById("metricasAnoB").value;
  const seller = document.getElementById("metricasVendedor").value;
  if (document.getElementById("metricasPreset").value === "custom") return new URLSearchParams({ yearA, yearB, seller, startA: document.getElementById("metricasInicioA").value, endA: document.getElementById("metricasFimA").value, startB: document.getElementById("metricasInicioB").value, endB: document.getElementById("metricasFimB").value });
  const [fromMonth, toMonth] = document.getElementById("metricasRecorte").value.split("-");
  return new URLSearchParams({ yearA, yearB, seller, fromMonth, toMonth });
}

function mtRenderTable(customers) {
  const statusFiltro = document.getElementById("metricasStatusFiltro")?.value || "todos";
  const filtered = statusFiltro === "todos" ? customers : customers.filter(item => item.metric_status === statusFiltro);
  document.getElementById("metricasTabela").innerHTML = filtered.length ? filtered.map(customer => {
    const badge = customer.priority.level === "Alta" ? "danger" : customer.priority.level === "Média" ? "warning text-dark" : "success";
    const status = metricasStatus.find(item => item.name === customer.metric_status);
    return `<tr role="button" data-cliente-metrica="${customer.id}"><td><span class="badge bg-${badge}">${mtSeguro(customer.priority.level)}</span></td><td><span class="badge" style="background:${mtSeguro(status?.color || "#6c757d")}">${mtSeguro(customer.metric_status)}</span></td><td>${mtSeguro(customer.customer_code)}</td><td><strong>${mtSeguro(customer.company_name || "Nome não informado")}</strong></td><td>${mtMoeda(customer.totalA)}</td><td>${mtMoeda(customer.totalB)}</td><td class="${customer.variation < 0 ? "text-danger" : "text-success"}">${mtPercentual(customer.variation)}</td><td class="small text-secondary">${mtSeguro(customer.priority.reason)}</td></tr>`;
  }).join("") : '<tr><td colspan="8" class="text-center text-secondary py-5">Nenhum cliente encontrado neste período.</td></tr>';
}

function mtRenderChart(items, labelA, labelB) {
  const max = Math.max(1, ...items.flatMap(item => [item.valueA, item.valueB]));
  document.getElementById("metricasGrafico").innerHTML = items.length ? `<div class="metrics-legend"><span><i class="year-a"></i>${mtSeguro(labelA)}</span><span><i class="year-b"></i>${mtSeguro(labelB)}</span></div><div class="metrics-bars">${items.map(item => `<div class="metrics-month"><div class="metrics-columns"><span class="year-a" style="height:${Math.max(item.valueA ? 4 : 0, item.valueA / max * 150)}px" title="${mtMoeda(item.valueA)}"></span><span class="year-b" style="height:${Math.max(item.valueB ? 4 : 0, item.valueB / max * 150)}px" title="${mtMoeda(item.valueB)}"></span></div><small>${mtSeguro(item.label)}</small></div>`).join("")}</div>` : '<div class="app-state py-4"><p class="mb-0">Não há relatórios dentro do período escolhido.</p></div>';
}

async function carregarMetricasClientes() {
  const data = await mtJson(`/api/customer-metrics/dashboard?${mtParametros()}`); metricasClientesCache = data.customers;
  const labelA = `${mtData(data.rangeA.start)} a ${mtData(data.rangeA.end)}`; const labelB = `${mtData(data.rangeB.start)} a ${mtData(data.rangeB.end)}`;
  document.getElementById("metricasCabA").textContent = labelA; document.getElementById("metricasCabB").textContent = labelB;
  const totalA = data.customers.reduce((s, i) => s + i.totalA, 0); const totalB = data.customers.reduce((s, i) => s + i.totalB, 0);
  document.getElementById("metricasCards").innerHTML = [["Clientes analisados", data.customers.length, "bi-people"], ["Período anterior", mtMoeda(totalA), "bi-calendar3"], ["Período atual", mtMoeda(totalB), "bi-calendar-check"], ["Prioridade alta", data.customers.filter(i => i.priority.level === "Alta").length, "bi-exclamation-triangle"]].map(([label, value, icon]) => `<div class="col-sm-6 col-xl-3"><div class="card metrics-panel metrics-summary-card text-light shadow h-100"><div class="card-body"><i class="bi ${icon} text-success"></i><small class="d-block mt-2">${label}</small><strong class="fs-4">${value}</strong></div></div></div>`).join("");
  const select = document.getElementById("metricasVendedor"); const selected = select.value; const sellers = [...new Set([...(data.sellers || []), "Alisson", "Noberto", "Aldener", "Letícia", "Clayton", "Outros"])].sort(); select.innerHTML = '<option value="todos">Todos</option>' + sellers.map(item => `<option>${mtSeguro(item)}</option>`).join(""); select.value = sellers.includes(selected) ? selected : "todos";
  mtRenderTable(data.customers); mtRenderChart(data.timeline, labelA, labelB);
}

async function mtAbrirCliente(id) {
  const client = await mtJson(`/api/customer-metrics/clients/${id}`); document.getElementById("metricasFichaTitulo").textContent = `${client.customer_code || "Sem código"} — ${client.company_name || client.name || "Nome não informado"}`;
  document.getElementById("metricasFichaConteudo").innerHTML = `<div class="row g-3 mb-4"><div class="col-md-4"><label class="form-label">Status comercial</label><select id="mtFichaStatus" class="form-select">${client.status_options.map(item => `<option value="${mtSeguro(item.name)}" ${item.name === client.metric_status ? "selected" : ""}>${mtSeguro(item.name)}</option>`).join("")}</select></div><div class="col-md-4"><label class="form-label">Principais produtos</label><textarea id="mtFichaPrincipais" class="form-control" rows="3">${mtSeguro(client.main_products)}</textarea></div><div class="col-md-4"><label class="form-label">Últimos produtos comprados</label><textarea id="mtFichaUltimos" class="form-control" rows="3">${mtSeguro(client.latest_products)}</textarea></div><div class="col-12"><label class="form-label">Anotações sobre o cliente</label><textarea id="mtFichaNotas" class="form-control" rows="4" placeholder="Registre contatos, contexto da empresa e próximos passos...">${mtSeguro(client.metric_notes)}</textarea></div><div class="col-12 text-end"><button id="mtSalvarFicha" class="btn btn-success">Salvar informações</button></div></div><div class="card metrics-panel"><div class="card-header"><strong>Histórico dos relatórios</strong></div><div class="table-responsive"><table class="table metrics-table mb-0"><thead><tr><th>Período</th><th>Vendedor</th><th>Valor</th><th>Pedidos</th><th>Média</th></tr></thead><tbody>${client.metrics.length ? client.metrics.map(item => `<tr><td>${mtData(item.period_start)} a ${mtData(item.period_end)}</td><td>${mtSeguro(item.report_seller || item.seller)}</td><td>${mtMoeda(item.purchased_value)}</td><td>${Number(item.order_count).toLocaleString("pt-BR")}</td><td>${mtMoeda(item.average_order_value)}</td></tr>`).join("") : '<tr><td colspan="5" class="text-center py-4">Sem métricas.</td></tr>'}</tbody></table></div></div>`;
  document.getElementById("mtSalvarFicha").onclick = async () => { await mtJson(`/api/customer-metrics/clients/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ metric_status: document.getElementById("mtFichaStatus").value, main_products: document.getElementById("mtFichaPrincipais").value, latest_products: document.getElementById("mtFichaUltimos").value, metric_notes: document.getElementById("mtFichaNotas").value }) }); bootstrap.Modal.getInstance(document.getElementById("modalFichaMetricas"))?.hide(); await carregarMetricasClientes(); };
  new bootstrap.Modal(document.getElementById("modalFichaMetricas")).show();
}

async function mtFilePayload(file) { const base64 = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.onerror = reject; reader.readAsDataURL(file); }); return { filename: file.name, base64 }; }
window.inicializarMetricasClientes = async () => {
  metricasStatus = await mtJson("/api/customer-metrics/status-options/metrics"); const filtro = document.getElementById("metricasStatusFiltro"); filtro.innerHTML = '<option value="todos">Todos</option>' + metricasStatus.map(item => `<option>${mtSeguro(item.name)}</option>`).join("");
  mtAtualizarRecortes(); await carregarMetricasClientes();
  document.getElementById("metricasPreset").addEventListener("change", mtAtualizarRecortes); document.getElementById("btnAplicarMetricas").addEventListener("click", carregarMetricasClientes); filtro.addEventListener("change", () => mtRenderTable(metricasClientesCache));
  document.getElementById("metricasPesquisa").addEventListener("input", event => { const term = event.target.value.toLowerCase(); mtRenderTable(metricasClientesCache.filter(item => `${item.customer_code} ${item.company_name}`.toLowerCase().includes(term))); });
  document.getElementById("metricasTabela").addEventListener("click", event => { const row = event.target.closest("[data-cliente-metrica]"); if (row) mtAbrirCliente(row.dataset.clienteMetrica).catch(error => alert(error.message)); });
  document.getElementById("btnPreverMetricas").addEventListener("click", async () => { try { const file = document.getElementById("arquivoMetricas").files[0]; if (!file) throw new Error("Selecione um relatório."); metricasArquivo = await mtFilePayload(file); const preview = await mtJson("/api/customer-metrics/imports/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(metricasArquivo) }); document.getElementById("metricasImportStatus").innerHTML = `<div class="alert alert-info mb-0"><strong>${mtSeguro(preview.period.type)}: ${mtData(preview.period.start)} a ${mtData(preview.period.end)}</strong><br>${preview.total} clientes, ${preview.newCustomers} novos e ${mtMoeda(preview.totalValue)} em compras.</div>`; document.getElementById("btnImportarMetricas").disabled = false; } catch (error) { document.getElementById("metricasImportStatus").innerHTML = `<div class="alert alert-danger mb-0">${mtSeguro(error.message)}</div>`; } });
  document.getElementById("btnImportarMetricas").addEventListener("click", async () => { try { const result = await mtJson("/api/customer-metrics/imports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(metricasArquivo) }); alert(`Relatório importado: ${result.total} clientes.`); bootstrap.Modal.getInstance(document.getElementById("modalImportarMetricas"))?.hide(); await carregarMetricasClientes(); } catch (error) { alert(error.message); } });
};
