let clienteEditando = null;
let atualizacaoWhatsappEmAndamento = false;

const estadosWhatsapp = {
    connected: { texto: "Conectado", classe: "bg-success" },
    connecting: { texto: "Conectando", classe: "bg-warning text-dark" },
    disconnected: { texto: "Desconectado", classe: "bg-secondary" }
};

function atualizarSeloWhatsapp(status) {
    const selo = document.getElementById("statusWhatsappNav");
    if (!selo) return;
    const estado = estadosWhatsapp[status] || { texto: "Indisponível", classe: "bg-danger" };
    selo.textContent = estado.texto;
    selo.className = `badge rounded-pill ${estado.classe}`;

    document.querySelectorAll("[data-whatsapp-action='connect']")
        .forEach(botao => { botao.disabled = status === "connected" || status === "connecting"; });
    document.querySelectorAll("[data-whatsapp-action='disconnect']")
        .forEach(botao => { botao.disabled = status === "disconnected"; });
}

function modalQRCodeWhatsapp() {
    const elemento = document.getElementById("whatsappQrModal");
    return elemento && window.bootstrap ? window.bootstrap.Modal.getOrCreateInstance(elemento) : null;
}

async function atualizarQRCodeWhatsapp(status) {
    const imagem = document.getElementById("whatsappQrImagem");
    const aguardando = document.getElementById("whatsappQrAguardando");
    const modal = modalQRCodeWhatsapp();
    if (!imagem || !aguardando || !modal) return;

    if (status !== "connecting") {
        imagem.removeAttribute("src");
        imagem.classList.add("d-none");
        aguardando.classList.remove("d-none");
        modal.hide();
        return;
    }

    try {
        const resposta = await fetch("/api/whatsapp/qrcode");
        if (!resposta.ok) throw new Error("QR indisponível.");
        const dados = await resposta.json();
        if (dados.qr) {
            imagem.src = dados.qr;
            imagem.classList.remove("d-none");
            aguardando.classList.add("d-none");
        } else {
            imagem.removeAttribute("src");
            imagem.classList.add("d-none");
            aguardando.classList.remove("d-none");
        }
        modal.show();
    } catch (erro) {
        console.warn("Não foi possível obter o QR Code.", erro);
    }
}

async function atualizarStatusWhatsapp() {
    if (atualizacaoWhatsappEmAndamento) return;
    atualizacaoWhatsappEmAndamento = true;
    try {
        const resposta = await fetch("/api/whatsapp/status");
        if (!resposta.ok) throw new Error("Status indisponível.");
        const dados = await resposta.json();
        atualizarSeloWhatsapp(dados.status);
        await atualizarQRCodeWhatsapp(dados.status);
    } catch (erro) {
        console.warn("Não foi possível consultar o WhatsApp.", erro);
        atualizarSeloWhatsapp("unavailable");
    } finally {
        atualizacaoWhatsappEmAndamento = false;
    }
}

async function executarAcaoWhatsapp(acao, botao) {
    if (botao) botao.disabled = true;
    try {
        const resposta = await fetch(`/api/whatsapp/${acao}`, { method: "POST" });
        const dados = await resposta.json();
        if (!resposta.ok) throw new Error(dados.message || "Não foi possível atualizar o WhatsApp.");
        await atualizarStatusWhatsapp();
    } catch (erro) {
        window.alert(erro.message);
        await atualizarStatusWhatsapp();
    } finally {
        if (botao) botao.disabled = false;
    }
}

function exibirLogin(exibir) {
    document.getElementById("loginOverlay")?.classList.toggle("d-none", !exibir);
    document.body.classList.toggle("auth-locked", exibir);
    if (exibir) setTimeout(() => document.getElementById("loginPassword")?.focus(), 50);
}

async function verificarSessao() {
    const resposta = await fetch("/api/auth/session");
    const sessao = await resposta.json();
    exibirLogin(sessao.required && !sessao.authenticated);
    document.getElementById("btnLogout")?.classList.toggle("d-none", !sessao.required);
    return sessao.authenticated;
}

document.addEventListener("DOMContentLoaded", async () => {
    const aplicarEstadoSidebar = recolhida => {
        document.body.classList.toggle("sidebar-collapsed", recolhida);
        const botao = document.getElementById("btnToggleSidebar");
        if (!botao) return;
        botao.setAttribute("aria-label", recolhida ? "Expandir menu lateral" : "Recolher menu lateral");
        botao.title = recolhida ? "Expandir menu lateral" : "Recolher menu lateral";
        botao.querySelector("i").className = `bi ${recolhida ? "bi-layout-sidebar" : "bi-layout-sidebar-inset"}`;
    };
    aplicarEstadoSidebar(window.localStorage.getItem("baileybot_sidebar_collapsed") === "1");
    document.getElementById("btnToggleSidebar")?.addEventListener("click", () => {
        const recolhida = !document.body.classList.contains("sidebar-collapsed");
        aplicarEstadoSidebar(recolhida);
        window.localStorage.setItem("baileybot_sidebar_collapsed", recolhida ? "1" : "0");
    });
    document.querySelectorAll("#sidebarMenu [data-bs-toggle='collapse']").forEach(botao => botao.addEventListener("click", () => {
        if (!document.body.classList.contains("sidebar-collapsed")) return;
        aplicarEstadoSidebar(false);
        window.localStorage.setItem("baileybot_sidebar_collapsed", "0");
    }));

    document.getElementById("loginForm")?.addEventListener("submit", async evento => {
        evento.preventDefault();
        const botao = evento.currentTarget.querySelector("button");
        const erro = document.getElementById("loginErro");
        botao.disabled = true;
        erro.textContent = "";
        try {
            const resposta = await fetch("/api/auth/login", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password: document.getElementById("loginPassword").value })
            });
            const dados = await resposta.json();
            if (!resposta.ok) throw new Error(dados.error || "Não foi possível entrar.");
            exibirLogin(false);
            Router.carregarPagina(Router.paginaPeloHash(), { fromHash: true });
        } catch (falha) {
            erro.textContent = falha.message;
        } finally {
            botao.disabled = false;
        }
    });

    document.getElementById("btnLogout")?.addEventListener("click", async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        exibirLogin(true);
    });

    const autenticado = await verificarSessao();
    document.querySelectorAll("[data-whatsapp-action]").forEach(botao => {
        botao.addEventListener("click", () => executarAcaoWhatsapp(botao.dataset.whatsappAction, botao));
    });
    await atualizarStatusWhatsapp();
    window.setInterval(atualizarStatusWhatsapp, 3000);
    Router.iniciar();
    if (!autenticado) exibirLogin(true);
});
