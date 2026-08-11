/* global bootstrap, REATIVACAO_STATUS, rcSeguro, rcJson */
let rrReports = [];
let rrRows = [];
let rrCurrentReport = null;
let rrTags = [];

const rrNumber = (value) => {
  const text = String(value || "").replace(/R\$|\s/g, "");
  return (
    Number(
      text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text,
    ) || 0
  );
};
const rrAlert = (message, type = "success") => {
  const el = document.getElementById("rcReportAlert");
  el.className = `alert alert-${type}`;
  el.textContent = message;
};
const rrFile = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

async function rrLoadReports() {
  rrReports = await rcJson("/api/reactivation/reports");
  document.getElementById("rcReportList").innerHTML = rrReports.length
    ? rrReports
        .map(
          (report) =>
            `<button class="btn text-start border ${rrCurrentReport?.id === report.id ? "border-success" : "border-secondary"}" data-report="${report.id}"><strong class="d-block text-light">${rcSeguro(report.filename)}</strong><small class="text-secondary">${report.pending_rows} pendente(s) · ${report.approved_rows} aprovado(s) · ${rrMoeda(report.total_value)}</small></button>`,
        )
        .join("")
    : '<div class="text-secondary text-center py-4">Nenhum relatório importado.</div>';
  document
    .querySelectorAll("[data-report]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        rrOpenReport(Number(button.dataset.report)),
      ),
    );
}
const rrMoeda = (value) =>
  Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
async function rrOpenReport(id) {
  rrCurrentReport = rrReports.find((item) => item.id === id);
  await rrLoadReports();
  await rrLoadRows();
}
async function rrLoadRows() {
  if (!rrCurrentReport) return;
  const status = document.getElementById("rcReportStatus").value;
  rrRows = await rcJson(
    `/api/reactivation/reports/${rrCurrentReport.id}/rows?status=${status}`,
  );
  document.getElementById("rcReportTitle").textContent =
    rrCurrentReport.filename;
  document.getElementById("rcReportSummary").textContent =
    `${rrCurrentReport.pending_rows} pendente(s), ${rrCurrentReport.approved_rows} aprovado(s), ${rrCurrentReport.excluded_rows} excluído(s)`;
  document.getElementById("rcReportRows").innerHTML = rrRows.length
    ? rrRows
        .map(
          (row) =>
            `<tr data-open-row="${row.id}" class="${row.status === "excluido" ? "text-secondary" : ""}"><td><strong>${rcSeguro(row.company_name)}</strong></td><td class="text-end">${rrMoeda(row.purchased_value)}</td><td>${row.possible_match ? `<span class="badge bg-info text-dark">Possível: ${rcSeguro(row.possible_match.customer_code)}</span>` : "—"}</td><td><span class="badge ${row.status === "aprovado" ? "bg-success" : row.status === "excluido" ? "bg-secondary" : "bg-warning text-dark"}">${row.status}</span></td><td class="text-end">${row.status === "pendente" ? `<button class="btn btn-sm btn-outline-danger" data-delete-row="${row.id}">Excluir</button> <button class="btn btn-sm btn-success" data-approve-row="${row.id}">Aprovar</button>` : ""}</td></tr>`,
        )
        .join("")
    : '<tr><td colspan="5" class="text-center text-secondary py-5">Nenhum cliente neste filtro.</td></tr>';
  document.querySelectorAll("[data-open-row]").forEach((tr) =>
    tr.addEventListener("click", (event) => {
      if (!event.target.closest("button"))
        rrOpenRow(Number(tr.dataset.openRow)).catch((error) =>
          rrAlert(error.message, "danger"),
        );
    }),
  );
  document
    .querySelectorAll("[data-approve-row]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        rrOpenRow(Number(button.dataset.approveRow)).catch((error) =>
          rrAlert(error.message, "danger"),
        ),
      ),
    );
  document
    .querySelectorAll("[data-delete-row]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        rrDeleteRow(Number(button.dataset.deleteRow)),
      ),
    );
}
async function rrOpenRow(id) {
  const row = rrRows.find((item) => item.id === id);
  if (!row || row.status !== "pendente") return;
  const existing = row.possible_match?.id
    ? await rcJson(`/api/reactivation/clients/${row.possible_match.id}`)
    : null;
  document.getElementById("rrRowId").value = row.id;
  document.getElementById("rrCodigo").value = existing?.customer_code || "";
  document.getElementById("rrEmpresa").value = row.company_name;
  document.getElementById("rrNome").value = existing?.name || "";
  document.getElementById("rrTelefone").value = existing?.telefone || "";
  document.getElementById("rrVendedor").value = existing?.seller || "";
  document.getElementById("rrStatus").value =
    existing?.reactivation_status || "Sem Contato";
  document.getElementById("rrUltimaData").value =
    existing?.last_movement_at || "";
  document.getElementById("rrUltimoValor").value = rrNumber(
    existing?.last_movement_value ?? row.purchased_value,
  )
    .toFixed(2)
    .replace(".", ",");
  document.getElementById("rrAcumulado").value = rrNumber(row.purchased_value)
    .toFixed(2)
    .replace(".", ",");
  document.getElementById("rrProximoContato").value =
    existing?.next_contact_at || "";
  document.getElementById("rrObservacao").value =
    existing?.reactivation_notes || "";
  const selectedTags = new Set(
    (existing?.tags || []).map((tag) => Number(tag.id)),
  );
  document.getElementById("rrEtiquetas").innerHTML = rrTags
    .map(
      (tag) =>
        `<label class="reactivation-tag-choice"><input type="checkbox" value="${tag.id}" ${selectedTags.has(Number(tag.id)) ? "checked" : ""}><span style="--tag-color:${rcSeguro(tag.color)}">${rcSeguro(tag.name)}</span></label>`,
    )
    .join("");
  const notice = document.getElementById("rrMatchNotice");
  notice.classList.toggle("d-none", !row.possible_match);
  notice.textContent = row.possible_match
    ? `Possível cadastro existente: Código OG1 ${row.possible_match.customer_code} — confirme antes de aprovar.`
    : "";
  bootstrap.Modal.getOrCreateInstance(
    document.getElementById("rcReportClientModal"),
  ).show();
}
const rrPayload = () => ({
  customer_code: document.getElementById("rrCodigo").value,
  company_name: document.getElementById("rrEmpresa").value,
  name: document.getElementById("rrNome").value,
  telefone: document.getElementById("rrTelefone").value,
  seller: document.getElementById("rrVendedor").value,
  reactivation_status: document.getElementById("rrStatus").value,
  last_movement_at: document.getElementById("rrUltimaData").value,
  last_movement_value: document.getElementById("rrUltimoValor").value,
  accumulated_value: document.getElementById("rrAcumulado").value,
  next_contact_at: document.getElementById("rrProximoContato").value,
  reactivation_notes: document.getElementById("rrObservacao").value,
  tag_ids: [...document.querySelectorAll("#rrEtiquetas input:checked")].map(
    (input) => Number(input.value),
  ),
});
async function rrSaveRow() {
  const id = document.getElementById("rrRowId").value;
  await rcJson(`/api/reactivation/report-rows/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      company_name: document.getElementById("rrEmpresa").value,
      purchased_value: document.getElementById("rrAcumulado").value,
    }),
  });
  rrAlert("Alterações salvas.");
  await rrLoadReports();
  await rrLoadRows();
}
async function rrApprove(event) {
  event.preventDefault();
  const id = document.getElementById("rrRowId").value;
  await rcJson(`/api/reactivation/report-rows/${id}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(rrPayload()),
  });
  bootstrap.Modal.getInstance(
    document.getElementById("rcReportClientModal"),
  ).hide();
  rrAlert("Cliente aprovado e enviado para Vendedores.");
  await rrLoadReports();
  rrCurrentReport = rrReports.find((item) => item.id === rrCurrentReport.id);
  await rrLoadRows();
}
async function rrDeleteRow(id) {
  if (!confirm("Excluir este cliente da conferência do relatório?")) return;
  await rcJson(`/api/reactivation/report-rows/${id}`, { method: "DELETE" });
  rrAlert("Cliente excluído do relatório.", "warning");
  await rrLoadReports();
  rrCurrentReport = rrReports.find((item) => item.id === rrCurrentReport.id);
  await rrLoadRows();
}
async function rrImport() {
  const file = document.getElementById("rcReportFile").files[0];
  if (!file) return;
  const base64 = await rrFile(file);
  const result = await rcJson("/api/reactivation/reports/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base64, filename: file.name }),
  });
  rrAlert(
    `${result.report.total_rows} cliente(s) carregado(s) para conferência.`,
  );
  await rrLoadReports();
  await rrOpenReport(result.report.id);
}
async function inicializarRelatoriosReativacao() {
  rrTags = await rcJson("/api/reactivation/tags");
  document.getElementById("rrStatus").innerHTML = REATIVACAO_STATUS.map(
    (status) => `<option>${status}</option>`,
  ).join("");
  document
    .getElementById("rcImportReport")
    .addEventListener("click", () =>
      document.getElementById("rcReportFile").click(),
    );
  document
    .getElementById("rcReportFile")
    .addEventListener("change", () =>
      rrImport().catch((error) => rrAlert(error.message, "danger")),
    );
  document
    .getElementById("rcReportStatus")
    .addEventListener("change", () =>
      rrLoadRows().catch((error) => rrAlert(error.message, "danger")),
    );
  document
    .getElementById("rrSaveRow")
    .addEventListener("click", () =>
      rrSaveRow().catch((error) => rrAlert(error.message, "danger")),
    );
  document
    .getElementById("rcReportClientForm")
    .addEventListener("submit", (event) =>
      rrApprove(event).catch((error) => rrAlert(error.message, "danger")),
    );
  await rrLoadReports();
}
window.inicializarRelatoriosReativacao = inicializarRelatoriosReativacao;
