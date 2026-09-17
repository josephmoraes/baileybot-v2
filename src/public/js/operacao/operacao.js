const opSeguro = valor => String(valor ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const opData = valor => valor ? new Date(String(valor).replace(" ", "T") + (String(valor).includes("T") ? "" : "Z")).toLocaleString("pt-BR") : "—";
async function opJson(url) { const resposta = await fetch(url); const dados = await resposta.json(); if (!resposta.ok) throw new Error(dados.error || "Não foi possível carregar os dados."); return dados; }
async function opCarregarImportacoes() {
    const modulo = document.getElementById("operacaoModulo")?.value || "";
    const dados = await opJson("/api/operations/imports?limit=200"); const itens = dados.filter(item => !modulo || item.module === modulo);
    document.getElementById("operacaoImportacoes").innerHTML = itens.length ? itens.map(item => `<tr><td>${opData(item.created_at)}</td><td>${opSeguro(item.module)}</td><td>${opSeguro(item.filename)}</td><td><strong>${item.imported_rows}</strong> importadas · ${item.error_rows} erro(s) · ${item.duplicate_rows} duplicada(s)</td><td><button class="btn btn-sm btn-outline-light" data-importacao-id="${item.id}">Ver erros</button></td></tr>`).join("") : '<tr><td colspan="5" class="text-center text-secondary py-4">Nenhuma importação encontrada.</td></tr>';
    document.querySelectorAll("[data-importacao-id]").forEach(button => button.addEventListener("click", () => opAbrirImportacao(button.dataset.importacaoId)));
}
async function opAbrirImportacao(id) {
    const item = await opJson(`/api/operations/imports/${id}`); const erros = item.errors || [];
    document.getElementById("operacaoImportacaoDetalhes").innerHTML = `<p><strong>${opSeguro(item.filename)}</strong> · ${opSeguro(item.module)} · por ${opSeguro(item.imported_by)}</p><p>${item.total_rows} linhas analisadas, ${item.imported_rows} importadas, ${item.created_customers} clientes criados, ${item.updated_customers} atualizados, ${item.ignored_rows} ignoradas.</p>${erros.length ? `<div class="table-responsive"><table class="table table-dark"><thead><tr><th>Linha</th><th>Código OG1</th><th>Erro</th></tr></thead><tbody>${erros.map(erro => `<tr><td>${erro.row_number || "—"}</td><td>${opSeguro(erro.customer_code || "—")}</td><td>${opSeguro(erro.error)}</td></tr>`).join("")}</tbody></table></div>` : '<p class="text-success mb-0">Esta importação não teve erros de linha.</p>'}`;
    bootstrap.Modal.getOrCreateInstance(document.getElementById("operacaoImportacaoModal")).show();
}
async function opCarregarLogs() {
    const nivel = document.getElementById("operacaoNivel")?.value || ""; const dados = await opJson(`/api/operations/logs?limit=200${nivel ? `&level=${encodeURIComponent(nivel)}` : ""}`);
    const cores = { error: "danger", warning: "warning text-dark", info: "secondary" };
    document.getElementById("operacaoLogs").innerHTML = dados.length ? dados.map(item => `<tr><td>${opData(item.created_at)}</td><td><span class="badge bg-${cores[item.level] || "secondary"}">${opSeguro(item.level)}</span></td><td>${opSeguro(item.module)}</td><td>${opSeguro(item.action)}</td><td>${opSeguro(item.message)}</td></tr>`).join("") : '<tr><td colspan="5" class="text-center text-secondary py-4">Nenhum log encontrado.</td></tr>';
}
window.inicializarOperacao = async () => {
    const carregar = async () => { try { await Promise.all([opCarregarImportacoes(), opCarregarLogs()]); } catch (erro) { alert(erro.message); } };
    document.getElementById("operacaoAtualizar").addEventListener("click", carregar); document.getElementById("operacaoModulo").addEventListener("change", opCarregarImportacoes); document.getElementById("operacaoNivel").addEventListener("change", opCarregarLogs); await carregar();
};
