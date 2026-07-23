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

        document.getElementById("statusWhatsapp").textContent =
            dados.whatsapp;

        const badge = document.getElementById("statusWhatsapp");
        badge.classList.remove(
            "bg-success",
            "bg-danger",
            "bg-warning"
        );

        switch (dados.whatsapp) {

            case "Conectado":
                badge.classList.add("bg-success");
                break;

            case "Conectando":
                badge.classList.add("bg-warning");
                break;

            default:
                badge.classList.add("bg-danger");

        }

        const texto = document.getElementById("statusTexto");

        if (texto) {

            switch (dados.whatsapp) {

                case "Conectado":
                        texto.textContent = "Online";
                        break;

                case "Conectando":
                        texto.textContent = "Conectando...";
                        break;

                default:
                        texto.textContent = "Offline";

            }

        }

    } catch (erro) {

        console.error("Erro ao carregar dashboard:", erro);

    }
}