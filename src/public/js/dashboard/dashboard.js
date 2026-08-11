const dashboardFormatador = new Intl.NumberFormat("pt-BR");
const dashboardMoeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dashboardCredito = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dashboardSeguro = valor => String(valor ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

function dashboardTextoStatus(status) {
    const textos = { connected: "Conectado", connecting: "Conectando", disconnected: "Desconectado" };
    return textos[status] || "Desconectado";
}

function dashboardStatusCampanha(status) {
    const textos = { rascunho: "Rascunho", pronta: "Pronta", enviando: "Enviando", pausada: "Pausada", concluida: "Concluída", erro: "Com erro" };
    return textos[status] || status;
}

function renderizarGraficoMensagens(serie = []) {
    const container = document.getElementById("graficoMensagens");
    if (!container) return;
    const maior = Math.max(...serie.map(item => item.total), 1);
    container.innerHTML = serie.map(item => `
        <div class="dashboard-chart-column" title="${item.total} mensagens em ${item.data}">
            <span>${dashboardFormatador.format(item.total)}</span>
            <div class="dashboard-chart-track"><div class="dashboard-chart-bar" style="height:${Math.max((item.total / maior) * 100, item.total ? 8 : 2)}%"></div></div>
            <small>${item.dia}</small>
        </div>`).join("");
}

function renderizarAtividades(atividades = [], demonstracao = false) {
    const container = document.getElementById("atividadeRecente");
    if (!container) return;
    if (!atividades.length) {
        container.innerHTML = '<div class="dashboard-empty"><i class="bi bi-inbox"></i><span>Nenhuma atividade registrada ainda.</span></div>';
        return;
    }
    container.innerHTML = `${demonstracao ? '<div class="dashboard-demo-label">Exemplo visual — sem registros no banco</div>' : ""}${atividades.map(item => `
        <div class="dashboard-timeline-item">
            <span class="dashboard-timeline-icon ${item.cor || "primary"}"><i class="bi ${item.icone || "bi-activity"}"></i></span>
            <div><strong>${item.titulo}</strong><p>${item.descricao}</p></div>
            <time>${item.quando}</time>
        </div>`).join("")}`;
}

function renderizarCampanhas(campanhas = []) {
    const container = document.getElementById("campanhasResumo");
    if (!container) return;
    if (!campanhas.length) {
        container.innerHTML = '<div class="dashboard-empty"><i class="bi bi-megaphone"></i><span>Nenhuma campanha criada.</span></div>';
        return;
    }
    container.innerHTML = campanhas.map(item => {
        const total = Number(item.totalDestinatarios) || 0;
        const enviados = Number(item.enviados) || 0;
        const percentual = total ? Math.round((enviados / total) * 100) : 0;
        return `<div class="dashboard-campaign-item">
            <div class="d-flex justify-content-between gap-3"><div><strong>${item.nome}</strong><p>${enviados} enviados de ${total}</p></div><span class="dashboard-chip">${dashboardStatusCampanha(item.status)}</span></div>
            <div class="progress"><div class="progress-bar bg-success" style="width:${percentual}%"></div></div>
        </div>`;
    }).join("");
}

function renderizarAvisos(avisos = []) {
    const container = document.getElementById("dashboardAvisos");
    if (!container) return;
    if (!avisos.length) {
        container.innerHTML = '<div class="dashboard-ok"><i class="bi bi-check-circle-fill"></i><span>Tudo certo por aqui.</span></div>';
        return;
    }
    container.innerHTML = avisos.map(aviso => `<div class="dashboard-alert"><i class="bi ${aviso.icone || "bi-exclamation-triangle"}"></i><span>${aviso.texto}</span></div>`).join("");
}

function renderizarUltimosEnvios(itens = []) {
    const tabela = document.getElementById("ultimosEnvios");
    if (!tabela) return;
    if (!itens.length) {
        tabela.innerHTML = '<tr><td colspan="4" class="text-center text-secondary py-5"><i class="bi bi-send d-block fs-4 mb-2"></i>Nenhum envio registrado.</td></tr>';
        return;
    }
    tabela.innerHTML = itens.map(item => `<tr><td>${dashboardSeguro(item.cliente)}</td><td>${dashboardSeguro(item.campanha || "Envio individual")}</td><td><span class="badge ${item.status === "enviado" ? "bg-success" : "bg-danger"}">${dashboardSeguro(item.status)}</span></td><td>${new Date(`${item.enviado_em.replace(" ", "T")}Z`).toLocaleString("pt-BR")}</td></tr>`).join("");
}

async function carregarDashboard() {
    if (!document.querySelector(".dashboard-page")) return;
    try {
        const resposta = await fetch("/api/dashboard");
        if (!resposta.ok) throw new Error("Não foi possível carregar o dashboard.");
        const dados = await resposta.json();
        document.getElementById("totalClientes").textContent = dashboardFormatador.format(dados.kpis.totalClientes);
        document.getElementById("mensagensHoje").textContent = dashboardFormatador.format(dados.kpis.mensagensHoje);
        document.getElementById("campanhasAtivas").textContent = dashboardFormatador.format(dados.kpis.campanhasAtivas);
        document.getElementById("totalMensagens").textContent = dashboardFormatador.format(dados.kpis.totalMensagens);
        document.getElementById("totalCampanhas").textContent = dashboardFormatador.format(dados.kpis.totalCampanhas);
        document.getElementById("totalTecnicos").textContent = dashboardFormatador.format(dados.kpis.totalTecnicos);
        document.getElementById("comissaoLiberada").textContent = dashboardCredito.format(dados.kpis.comissaoLiberada);
        document.getElementById("comissaoPendente").textContent = `${dashboardCredito.format(dados.kpis.comissaoPendente)} pendentes`;
        document.getElementById("statusWhatsappKpi").textContent = dashboardTextoStatus(dados.whatsapp.status);
        document.getElementById("totalSemana").textContent = `${dashboardFormatador.format(dados.mensagensSemana)} na semana`;
        document.getElementById("metaProgresso").textContent = `${dados.meta.percentual}%`;
        document.getElementById("metaResumo").textContent = `${dados.meta.atual} de ${dados.meta.limite}`;
        document.getElementById("metaBarra").style.width = `${dados.meta.percentual}%`;
        document.getElementById("metaMensagem").textContent = dados.meta.restante > 0 ? `Faltam ${dados.meta.restante} mensagens para atingir a meta.` : "Meta diária atingida.";
        document.getElementById("dashboardAtualizado").textContent = `Atualizado às ${new Date(dados.atualizadoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
        renderizarGraficoMensagens(dados.graficoMensagens);
        renderizarAtividades(dados.atividades, dados.atividadesDemonstracao);
        renderizarCampanhas(dados.campanhas);
        renderizarAvisos(dados.avisos);
        renderizarUltimosEnvios(dados.ultimosEnvios);
        atualizarStatusWhatsapp(dados.whatsapp.status);
    } catch (erro) {
        console.error("Erro ao carregar dashboard:", erro);
        const atualizado = document.getElementById("dashboardAtualizado");
        if (atualizado) atualizado.textContent = "Não foi possível atualizar";
    }
}

function atualizarStatusWhatsapp(status) {
    const texto = dashboardTextoStatus(status);
    const classes = status === "connected" ? "bg-success" : status === "connecting" ? "bg-warning text-dark" : "bg-danger";
    const kpi = document.getElementById("statusWhatsappKpi");
    if (kpi) kpi.textContent = texto;
    [document.getElementById("statusWhatsappNav"), document.getElementById("statusWhatsappCard")].filter(Boolean).forEach(badge => {
        badge.className = `badge rounded-pill ${classes}`;
        badge.textContent = texto;
    });
    const descricao = document.getElementById("whatsappDescricao");
    if (descricao) descricao.textContent = status === "connected" ? "Sessão pronta para enviar mensagens." : status === "connecting" ? "Aguardando a conclusão da conexão." : "Inicie uma sessão e leia o QR Code para conectar.";
}

async function carregarStatusWhatsapp() {
    try {
        const response = await fetch("/api/whatsapp/status");
        if (!response.ok) throw new Error("Falha ao consultar o WhatsApp.");
        atualizarStatusWhatsapp((await response.json()).status);
    } catch (erro) {
        console.error("Erro ao carregar status:", erro);
        atualizarStatusWhatsapp("disconnected");
    }
}

async function carregarQRCode() {
    try {
        const response = await fetch("/api/whatsapp/qrcode");
        const data = await response.json();
        const container = document.getElementById("qrContainer");
        const imagem = document.getElementById("qrCode");
        if (!container || !imagem) return;
        imagem.src = data.qr || "";
        container.classList.toggle("d-none", !data.qr);
    } catch (erro) { console.error("Erro ao carregar QR Code:", erro); }
}

async function conectarWhatsapp() {
    try {
        const response = await fetch("/api/whatsapp/connect", { method: "POST" });
        if (!response.ok) throw new Error("Não foi possível iniciar a conexão.");
        await Promise.all([carregarStatusWhatsapp(), carregarQRCode()]);
    } catch (erro) { console.error("Erro ao conectar:", erro); }
}

async function desconectarWhatsapp() {
    if (!confirm("Desconectar este WhatsApp? A sessão atual será removida e um novo QR Code será necessário.")) return;
    try {
        const response = await fetch("/api/whatsapp/disconnect", { method: "POST" });
        if (!response.ok) throw new Error("Não foi possível desconectar.");
        await Promise.all([carregarStatusWhatsapp(), carregarQRCode()]);
    } catch (erro) { console.error("Erro ao desconectar:", erro); }
}

document.addEventListener("click", event => {
    const acaoWhatsapp = event.target.closest("[data-whatsapp-action]");
    if (acaoWhatsapp) acaoWhatsapp.dataset.whatsappAction === "connect" ? conectarWhatsapp() : desconectarWhatsapp();
    const atalho = event.target.closest("[data-dashboard-page]");
    if (atalho && typeof Router !== "undefined") Router.carregarPagina(atalho.dataset.dashboardPage);
});

setInterval(() => {
    if (!document.querySelector(".dashboard-page")) return;
    carregarDashboard();
    carregarQRCode();
}, 30000);
