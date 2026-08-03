async function carregarDashboard() {
    try {

        const resposta = await fetch("/api/dashboard");
        const dados = await resposta.json();

        const totalClientes = document.getElementById("totalClientes");
        const totalCampanhas = document.getElementById("totalCampanhas");
        const totalMensagens = document.getElementById("totalMensagens");

        if (totalClientes) {
            totalClientes.textContent = dados.totalClientes;
        }

        if (totalCampanhas) {
            totalCampanhas.textContent = dados.totalCampanhas;
        }

        if (totalMensagens) {
            totalMensagens.textContent = dados.totalMensagens;
        }

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

    } catch (erro) {

        console.error("Erro ao carregar status:", erro);

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

async function carregarQRCode() {

    try {

        const response = await fetch("/api/whatsapp/qrcode");
        const data = await response.json();

        const container = document.getElementById("qrContainer");
        const imagem = document.getElementById("qrCode");

        if (!container || !imagem) return;

        if (data.qr) {

            imagem.src = data.qr;
            container.classList.remove("d-none");

        } else {

            imagem.src = "";
            container.classList.add("d-none");

        }

    } catch (erro) {

        console.error("Erro ao carregar QR Code:", erro);

    }

}

async function conectarWhatsapp() {

    try {

        const response = await fetch("/api/whatsapp/connect", {
            method: "POST"
        });

        const data = await response.json();

        console.log(data.message);

        carregarStatusWhatsapp();
        carregarQRCode();

    } catch (erro) {

        console.error("Erro ao conectar:", erro);

    }

}

async function desconectarWhatsapp() {

    if (!confirm("Desconectar este WhatsApp? A sessão atual será removida e, ao iniciar novamente, será exibido um novo QR Code.")) return;

    try {

        const response = await fetch("/api/whatsapp/disconnect", {
            method: "POST"
        });

        const data = await response.json();

        console.log(data.message);
        alert("WhatsApp desconectado. Clique em Iniciar para conectar outra conta.");

        carregarStatusWhatsapp();
        carregarQRCode();

    } catch (erro) {

        console.error("Erro ao desconectar:", erro);

    }

}

// Eventos dos botões
document.addEventListener("click", event => {
    const botao = event.target.closest("[data-whatsapp-action]");

    if (!botao) return;

    if (botao.dataset.whatsappAction === "connect") {
        conectarWhatsapp();
    }

    if (botao.dataset.whatsappAction === "disconnect") {
        desconectarWhatsapp();
    }
});

// Atualizações periódicas
carregarStatusWhatsapp();
carregarQRCode();

setInterval(() => {

    carregarDashboard();
    carregarStatusWhatsapp();
    carregarQRCode();

}, 5000);
