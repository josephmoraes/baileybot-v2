/* global tecnicosComissao, seguro, moeda, credito, dataBr, abrirTecnico, alertaComissao, apiComissao, modalTecnicoComissao, salvarTecnicoComissao, carregarTecnicos, importarComissoes, bootstrap */
let modalConfirmarSaldo;
let envioNotificacaoAtual;
let timerNotificacao;
let idsEnvioSaldo = [];
let modalExcluirImportacao;
let importacaoExclusaoAtual;

function tecnicosFiltrados() {
    const termo = document.getElementById("buscaTecnico")?.value.toLowerCase() || "";
    const status = document.getElementById("statusTecnico")?.value ?? "";
    return tecnicosComissao.filter(item =>
        (!status || String(item.active) === status) &&
        `${item.name} ${item.og1_code} ${item.phone || ""} ${item.email || ""}`.toLowerCase().includes(termo)
    );
}

function filtrarTecnicos() {
    const selected = new Set([...document.querySelectorAll(".selecionar-tecnico:checked")].map(item => Number(item.value)));
    const body = document.getElementById("tabelaTecnicos");
    const technicians = tecnicosFiltrados();
    body.innerHTML = technicians.length ? technicians.map(item => `<tr>
        <td><input class="form-check-input selecionar-tecnico" type="checkbox" value="${item.id}" ${selected.has(item.id) ? "checked" : ""} ${item.active ? "" : "disabled"}></td>
        <td>${seguro(item.name)}</td><td>${seguro(item.og1_code)}</td>
        <td>${seguro(item.phone || "—")}<br><small>${seguro(item.email || "")}</small></td>
        <td>${credito(item.total)}</td><td class="text-success">${credito(item.liberado)}</td><td class="text-warning">${credito(item.pendente)}</td>
        <td><span class="badge ${item.active ? "bg-success" : "bg-secondary"}">${item.active ? "Ativo" : "Inativo"}</span></td>
        <td class="text-nowrap"><button class="btn btn-sm btn-success" data-enviar-saldo="${item.id}" ${item.active ? "" : "disabled"}><i class="bi bi-whatsapp"></i> Enviar saldo</button> <button class="btn btn-sm btn-outline-light" data-editar-tecnico="${item.id}"><i class="bi bi-pencil"></i></button></td>
    </tr>`).join("") : '<tr><td colspan="9" class="text-center text-secondary">Nenhum técnico cadastrado.</td></tr>';
    body.querySelectorAll("[data-editar-tecnico]").forEach(button => button.addEventListener("click", () => abrirTecnico(Number(button.dataset.editarTecnico))));
    body.querySelectorAll("[data-enviar-saldo]").forEach(button => button.addEventListener("click", () => confirmarSaldoIndividual(Number(button.dataset.enviarSaldo)).catch(error => alertaComissao(error.message, "danger"))));
}

const idsTecnicosSelecionados = () => [...document.querySelectorAll(".selecionar-tecnico:checked")].map(item => Number(item.value));

async function confirmarSaldoIndividual(id) {
    const data = await apiComissao(`/api/commissions/technicians/${id}/balance-preview`);
    idsEnvioSaldo = [id];
    const item = data.technician;
    document.getElementById("confirmacaoSaldoCorpo").innerHTML = `<dl class="row"><dt class="col-sm-4">Nome</dt><dd class="col-sm-8">${seguro(item.name)}</dd><dt class="col-sm-4">Telefone</dt><dd class="col-sm-8">${seguro(item.phone || "Não cadastrado")}</dd><dt class="col-sm-4">Crédito total</dt><dd class="col-sm-8">${credito(item.total)}</dd><dt class="col-sm-4">Crédito disponível</dt><dd class="col-sm-8">${credito(item.available)}</dd></dl><label class="form-label">Prévia da mensagem</label><pre class="bg-black p-3 rounded text-light text-wrap">${seguro(data.message)}</pre>${data.canSend ? "" : '<div class="alert alert-danger mb-0">Este técnico não possui WhatsApp válido ou está inativo.</div>'}`;
    document.getElementById("confirmarEnvioSaldo").disabled = !data.canSend;
    modalConfirmarSaldo.show();
}

async function confirmarSaldosSelecionados() {
    const ids = idsTecnicosSelecionados();
    const data = await apiComissao("/api/commissions/technicians/balance-preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ technicianIds: ids }) });
    idsEnvioSaldo = ids;
    document.getElementById("confirmacaoSaldoCorpo").innerHTML = `<p>Revise o envio em massa antes de confirmar:</p><ul class="list-group"><li class="list-group-item bg-dark text-light d-flex justify-content-between"><span>Técnicos selecionados</span><strong>${data.selected}</strong></li><li class="list-group-item bg-dark text-light d-flex justify-content-between"><span>Com WhatsApp cadastrado</span><strong>${data.withWhatsapp}</strong></li><li class="list-group-item bg-dark text-light d-flex justify-content-between"><span>Sem WhatsApp cadastrado</span><strong>${data.withoutWhatsapp}</strong></li><li class="list-group-item bg-dark text-light d-flex justify-content-between"><span>Inativos</span><strong>${data.inactive}</strong></li><li class="list-group-item bg-dark text-light d-flex justify-content-between"><span>Serão enviados</span><strong>${data.willSend}</strong></li></ul><p class="text-secondary mt-3 mb-0">Os envios respeitarão o intervalo configurado no BaileyBot.</p>`;
    document.getElementById("confirmarEnvioSaldo").disabled = !data.willSend;
    modalConfirmarSaldo.show();
}

async function iniciarEnvioSaldo() {
    const job = await apiComissao("/api/commissions/technicians/send-balance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ technicianIds: idsEnvioSaldo }) });
    modalConfirmarSaldo.hide();
    acompanharNotificacao(job.id);
}

function atualizarProgresso(job) {
    envioNotificacaoAtual = job.id;
    const box = document.getElementById("progressoNotificacoes");
    if (!box) return;
    box.classList.remove("d-none");
    const percentage = job.total ? Math.round(job.processed / job.total * 100) : 0;
    document.getElementById("barraNotificacoes").style.width = `${percentage}%`;
    document.getElementById("barraNotificacoes").textContent = `${percentage}%`;
    document.getElementById("progressoEnviados").textContent = job.sent;
    document.getElementById("progressoAguardando").textContent = job.waiting;
    document.getElementById("progressoFalhas").textContent = job.failed;
    document.getElementById("progressoRestante").textContent = job.remaining;
    document.getElementById("cancelarNotificacoes").disabled = !["pendente", "processando", "cancelando"].includes(job.status);
}

async function acompanharNotificacao(id) {
    clearTimeout(timerNotificacao);
    const job = await apiComissao(`/api/commissions/notifications/jobs/${id}`);
    atualizarProgresso(job);
    if (["pendente", "processando", "cancelando"].includes(job.status)) {
        timerNotificacao = setTimeout(() => acompanharNotificacao(id).catch(error => alertaComissao(error.message, "danger")), 1000);
        return;
    }
    alertaComissao(`Envio finalizado: ${job.sent} enviado(s) e ${job.failed} falha(s).`, job.failed ? "warning" : "success");
    if (document.getElementById("tabelaHistoricoNotificacoes")) await carregarHistoricoNotificacoes();
    if (document.getElementById("tabelaImportacoes")) await carregarHistoricoComissoes();
}

async function cancelarNotificacao() {
    if (!envioNotificacaoAtual) return;
    await apiComissao(`/api/commissions/notifications/jobs/${envioNotificacaoAtual}/cancel`, { method: "POST" });
    alertaComissao("Cancelamento solicitado.", "warning");
}

async function carregarHistoricoNotificacoes() {
    const items = await apiComissao("/api/commissions/notifications/history");
    const body = document.getElementById("tabelaHistoricoNotificacoes");
    if (!body) return;
    const types = { novos_creditos: "Novos créditos", consulta_saldo: "Consulta de saldo" };
    const statuses = { enviado: ["Enviado", "bg-success"], falhou: ["Falhou", "bg-danger"], pendente: ["Pendente", "bg-warning text-dark"] };
    body.innerHTML = items.length ? items.map(item => `<tr><td>${seguro(item.technician_name)}</td><td>${seguro(item.phone || "—")}</td><td>${types[item.kind] || seguro(item.kind)}</td><td>${new Date(`${item.started_at}Z`).toLocaleString("pt-BR")}</td><td>${seguro(item.initiated_by)}</td><td><span class="badge ${statuses[item.status]?.[1] || "bg-secondary"}">${statuses[item.status]?.[0] || seguro(item.status)}</span></td><td>${seguro(item.error || "—")}</td></tr>`).join("") : '<tr><td colspan="7" class="text-center text-secondary">Nenhum envio registrado.</td></tr>';
}

async function excluirTecnicoComissao() {
    const id = Number(document.getElementById("tecnicoId").value);
    const tecnico = tecnicosComissao.find(item => item.id === id);
    if (!tecnico) return;
    const confirmado = window.confirm(`Excluir permanentemente o técnico ${tecnico.name}?\n\nEsta ação apaga também todos os créditos/comissões, solicitações e registros de histórico vinculados a ele. Não será possível desfazer.`);
    if (!confirmado) return;
    const resultado = await apiComissao(`/api/commissions/technicians/${id}`, { method: "DELETE" });
    modalTecnicoComissao.hide();
    await Promise.all([carregarTecnicos(), carregarHistoricoNotificacoes()]);
    alertaComissao(`${resultado.technician.name} e todos os registros vinculados foram excluídos permanentemente.`, "success");
}

async function inicializarTecnicosComissao() {
    modalTecnicoComissao = new bootstrap.Modal(document.getElementById("modalTecnico"));
    modalConfirmarSaldo = new bootstrap.Modal(document.getElementById("modalConfirmarSaldo"));
    document.getElementById("novoTecnico").addEventListener("click", () => abrirTecnico());
    document.getElementById("salvarTecnico").addEventListener("click", () => salvarTecnicoComissao().catch(error => alertaComissao(error.message, "danger")));
    document.getElementById("excluirTecnico").addEventListener("click", () => excluirTecnicoComissao().catch(error => alertaComissao(error.message, "danger")));
    document.getElementById("buscaTecnico").addEventListener("input", filtrarTecnicos);
    document.getElementById("statusTecnico").addEventListener("change", filtrarTecnicos);
    document.getElementById("selecionarTecnicos").addEventListener("click", () => document.querySelectorAll(".selecionar-tecnico:not(:disabled)").forEach(item => { item.checked = true; }));
    document.getElementById("limparTecnicos").addEventListener("click", () => document.querySelectorAll(".selecionar-tecnico").forEach(item => { item.checked = false; }));
    document.getElementById("enviarSaldosSelecionados").addEventListener("click", () => confirmarSaldosSelecionados().catch(error => alertaComissao(error.message, "danger")));
    document.getElementById("confirmarEnvioSaldo").addEventListener("click", () => iniciarEnvioSaldo().catch(error => alertaComissao(error.message, "danger")));
    document.getElementById("cancelarNotificacoes").addEventListener("click", () => cancelarNotificacao().catch(error => alertaComissao(error.message, "danger")));
    await Promise.all([carregarTecnicos(), carregarHistoricoNotificacoes()]);
}

async function iniciarNotificacaoImportacao(id, retry) {
    const url = retry ? `/api/commissions/imports/${id}/retry-notifications` : `/api/commissions/imports/${id}/notify`;
    const job = await apiComissao(url, { method: "POST" });
    acompanharNotificacao(job.id);
}

async function abrirExclusaoImportacao(id) {
    const impacto = await apiComissao(`/api/commissions/imports/${id}/delete-preview`);
    importacaoExclusaoAtual = id;
    document.getElementById("excluirImportacaoArquivo").textContent = impacto.import.filename;
    document.getElementById("excluirImportacaoComissoes").textContent = impacto.commissions_count;
    document.getElementById("excluirImportacaoVendas").textContent = moeda(impacto.sales_total);
    document.getElementById("excluirImportacaoCreditos").textContent = credito(impacto.commission_total);
    const aviso = document.getElementById("excluirImportacaoAviso");
    const mensagens = [];
    if (impacto.linked_requests) mensagens.push(`${impacto.linked_requests} solicitação(ões) utiliza(m) comissões deste relatório. A exclusão completa está bloqueada.`);
    if (impacto.active_notifications) mensagens.push("Existe uma notificação em andamento. Aguarde a conclusão antes de excluir.");
    aviso.textContent = mensagens.join(" ");
    aviso.classList.toggle("d-none", !mensagens.length);
    document.getElementById("excluirSomenteRelatorio").disabled = Boolean(impacto.active_notifications);
    document.getElementById("excluirRelatorioComissoes").disabled = Boolean(impacto.active_notifications || impacto.linked_requests);
    modalExcluirImportacao.show();
}

async function confirmarExclusaoImportacao(mode) {
    if (!importacaoExclusaoAtual) return;
    const resultado = await apiComissao(`/api/commissions/imports/${importacaoExclusaoAtual}`, {
        method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode })
    });
    modalExcluirImportacao.hide();
    importacaoExclusaoAtual = null;
    const mensagem = mode === "report"
        ? `Relatório excluído. ${resultado.preserved_commissions} comissão(ões) preservada(s).`
        : `Relatório e ${resultado.removed_commissions} comissão(ões) excluídos.`;
    alertaComissao(mensagem, "success");
    await carregarHistoricoComissoes();
}

async function carregarHistoricoComissoes() {
    const [imports, entries] = await Promise.all([apiComissao("/api/commissions/imports"), apiComissao("/api/commissions/entries")]);
    const statuses = { nao_notificada: ["Não notificada", "bg-secondary"], parcialmente_notificada: ["Parcialmente notificada", "bg-warning text-dark"], notificada: ["Notificada", "bg-success"] };
    document.getElementById("tabelaImportacoes").innerHTML = imports.length ? imports.map(item => {
        const status = statuses[item.notification_status] || statuses.nao_notificada;
        const button = item.notification_status === "parcialmente_notificada"
            ? `<button class="btn btn-sm btn-warning" data-retry-import="${item.id}"><i class="bi bi-arrow-repeat"></i> Reenviar notificações</button>`
            : `<button class="btn btn-sm btn-success" data-notify-import="${item.id}" ${item.notification_status === "notificada" || !item.imported_rows ? "disabled" : ""}><i class="bi bi-whatsapp"></i> Notificar técnicos desta importação</button>`;
        return `<tr><td>${new Date(`${item.created_at}Z`).toLocaleString("pt-BR")}</td><td>${seguro(item.filename)}</td><td>${item.imported_rows}</td><td>${item.duplicate_rows || 0}</td><td>${item.error_rows}</td><td>${credito(item.commission_total)}</td><td><span class="badge ${status[1]}">${status[0]}</span></td><td><div class="d-flex flex-wrap gap-2">${button}<button class="btn btn-sm btn-outline-danger" data-delete-import="${item.id}" title="Excluir relatório"><i class="bi bi-trash"></i> Excluir</button></div></td></tr>`;
    }).join("") : '<tr><td colspan="8" class="text-center text-secondary">Nenhuma importação.</td></tr>';
    document.querySelectorAll("[data-notify-import]").forEach(button => button.addEventListener("click", () => iniciarNotificacaoImportacao(Number(button.dataset.notifyImport), false).catch(error => alertaComissao(error.message, "danger"))));
    document.querySelectorAll("[data-retry-import]").forEach(button => button.addEventListener("click", () => iniciarNotificacaoImportacao(Number(button.dataset.retryImport), true).catch(error => alertaComissao(error.message, "danger"))));
    document.querySelectorAll("[data-delete-import]").forEach(button => button.addEventListener("click", () => abrirExclusaoImportacao(Number(button.dataset.deleteImport)).catch(error => alertaComissao(error.message, "danger"))));
    document.getElementById("tabelaComissoes").innerHTML = entries.length ? entries.map(item => `<tr><td>${seguro(item.document_number || item.movement)}</td><td>${seguro(item.commissioned_name || item.technician_name)}</td><td>${dataBr(item.sale_date)}</td><td>${moeda(item.sale_value)}</td><td>${credito(item.commission_value)}</td><td>${dataBr(item.release_date)}</td><td><span class="badge ${item.status === "liberada" ? "bg-success" : "bg-warning text-dark"}">${item.status}</span></td></tr>`).join("") : '<tr><td colspan="7" class="text-center text-secondary">Nenhum crédito gerado.</td></tr>';
}

async function inicializarHistoricoComissoes() {
    modalExcluirImportacao = new bootstrap.Modal(document.getElementById("modalExcluirImportacao"));
    document.getElementById("importarComissoes").addEventListener("click", () => importarComissoes().catch(error => alertaComissao(error.message, "danger")));
    document.getElementById("cancelarNotificacoes").addEventListener("click", () => cancelarNotificacao().catch(error => alertaComissao(error.message, "danger")));
    document.getElementById("excluirSomenteRelatorio").addEventListener("click", () => confirmarExclusaoImportacao("report").catch(error => alertaComissao(error.message, "danger")));
    document.getElementById("excluirRelatorioComissoes").addEventListener("click", () => confirmarExclusaoImportacao("report_and_commissions").catch(error => alertaComissao(error.message, "danger")));
    await carregarHistoricoComissoes();
}
