// =============================
// BaileyBot V2
// Dashboard
// =============================

document.addEventListener("DOMContentLoaded", () => {
    carregarDashboard();
});

async function carregarDashboard() {
    try {

        const resposta = await fetch("/api/dashboard");
        const dados = await resposta.json();

        document.getElementById("totalClientes").textContent =
            dados.totalClientes;

        document.getElementById("totalCampanhas").textContent =
            dados.totalCampanhas;

        document.getElementById("totalMensagens").textContent =
            dados.totalMensagens;

        const badge = document.getElementById("statusWhatsapp");
        const texto = document.getElementById("statusTexto");

        if (dados.whatsappConectado) {

            badge.className = "badge bg-success fs-6";
            badge.textContent = "Conectado";

            texto.textContent = "Online";

        } else {

            badge.className = "badge bg-danger fs-6";
            badge.textContent = "Desconectado";

            texto.textContent = "Offline";

        }

    } catch (erro) {

        console.error("Erro ao carregar dashboard:", erro);

    }
}