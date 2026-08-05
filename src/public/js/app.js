let clienteEditando = null;

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
    Router.iniciar();
    if (!autenticado) exibirLogin(true);
});
