// =============================
// BaileyBot V2
// Dashboard
// =============================

document.addEventListener("DOMContentLoaded", () => {

    carregarDashboard();
    carregarClientes();

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

async function carregarClientes() {

    try {

        const resposta = await fetch("/api/users");
        const clientes = await resposta.json();

        const tabela = document.getElementById("tabelaClientes");

        tabela.innerHTML = "";

        if (clientes.length === 0) {

            tabela.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center text-secondary py-4">
                        Nenhum cliente cadastrado.
                    </td>
                </tr>
            `;

            return;

        }

        clientes.forEach(cliente => {

            const data = new Date(cliente.created_at).toLocaleDateString("pt-BR");

            tabela.innerHTML += `
                <tr>
                    <td>${cliente.company_name ?? ""}</td>
                    <td>${cliente.name ?? ""}</td>
                    <td>${cliente.jid}</td>
                    <td>${data}</td>
                    <td>
                        <button class="btn btn-sm btn-primary">
                            <i class="bi bi-pencil"></i>
                        </button>

                        <button class="btn btn-sm btn-danger">
                            <i class="bi bi-trash"></i>
                        </button>
                    </td>
                </tr>
            `;

        });

    } catch (erro) {

        console.error("Erro ao carregar clientes:", erro);

    }

}