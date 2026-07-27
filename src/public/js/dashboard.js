async function carregarDashboard() {
    try {

        const resposta = await fetch("/api/dashboard");
        const dados = await resposta.json();

        document.getElementById("totalClientes").textContent =
            dados.totalClientes;

        document.getElementById("totalCampanhas").textContent =
            dados.totalCampanhas;

        // document.getElementById("totalMensagens").textContent =
        //    dados.totalMensagens;

    } catch (erro) {

        console.error("Erro ao carregar dashboard:", erro);

    }
}

async function carregarStatusWhatsapp() {
    try {
        const response = await fetch("/api/whatsapp/status");
        const data = await response.json();

        const badges = [
            document.getElementById("statusWhatsappNav"),
            document.getElementById("statusWhatsappCard")
        ].filter(Boolean);

        for (const badge of badges) {

            badge.className = "badge bg-light border fs-6";

            switch (data.status) {

                case "connected":
                    badge.classList.add("text-success");
                    badge.textContent = "🟢 Conectado";
                    break;

                case "connecting":
                    badge.classList.add("text-warning");
                    badge.textContent = "🟡 Conectando...";
                    break;

                default:
                    badge.classList.add("text-danger");
                    badge.textContent = "🔴 Desconectado";
                    break;  

            }

        }

    } catch (err) {

        console.error(err);

        const badges = [
            document.getElementById("statusWhatsappNav"),
            document.getElementById("statusWhatsappCard")
        ].filter(Boolean);

        for (const badge of badges) {
            badge.className = "badge bg-light border text-danger fs-6";
            badge.textContent = "Erro";
        }
    }
}

carregarDashboard();
carregarStatusWhatsapp();

setInterval(() => {
    carregarDashboard();
    carregarStatusWhatsapp();
}, 5000);