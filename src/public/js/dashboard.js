async function carregarDashboard() {

    try {

        const resposta = await fetch("/api/dashboard");
        const dados = await resposta.json();

        document.getElementById("totalClientes").textContent =
            dados.totalClientes;

        document.getElementById("totalCampanhas").textContent =
            dados.totalCampanhas;

    } catch (erro) {

        console.error("Erro ao carregar dashboard:", erro);

    }

}

async function carregarStatusWhatsapp() {

    try {

        const response = await fetch("/api/whatsapp/status");
        const data = await response.json();

        const badge = document.getElementById("statusWhatsapp");

        badge.className = "badge border bg-light fs-6";

        switch (data.status) {

            case "connected":
                badge.classList.add("text-success");
                badge.textContent = "🟢 Conectado";
                break;

            case "connecting":
                badge.classList.add("text-warning");
                badge.textContent = "🟡 Conectando";
                break;

            default:
                badge.classList.add("text-danger");
                badge.textContent = "🔴 Desconectado";
                break;

        }

    } catch (erro) {

        console.error("Erro ao carregar status do WhatsApp:", erro);

        const badge = document.getElementById("statusWhatsapp");

        if (badge) {

            badge.className = "badge border bg-light text-danger fs-6";
            badge.textContent = "Erro";

        }

    }

}

carregarDashboard();
carregarStatusWhatsapp();

setInterval(carregarStatusWhatsapp, 5000);