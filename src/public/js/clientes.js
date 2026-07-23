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
                        <button
                            class="btn btn-sm btn-primary"
                            onclick='editarCliente(${JSON.stringify(cliente)})'>

                            <i class="bi bi-pencil"></i>

                        </button>

                        <button
                            class="btn btn-sm btn-danger"
                            onclick="excluirCliente(${cliente.id})">
                            <i class="bi bi-trash"></i>
                        </button>
                    </td>
                </tr>
            `;

        });

    } catch (erro) {

        console.error(erro);

        alert(erro.message);

    }

}

async function salvarCliente() {

    const company_name = document.getElementById("company_name").value.trim();
    const name = document.getElementById("name").value.trim();
    const jid = document.getElementById("jid").value.trim();

    if (!jid) {

        alert("Informe o telefone.");

        return;

    }

    try {

        const url = clienteEditando
            ? `/api/users/${clienteEditando}`
            : "/api/users";


        const metodo = clienteEditando
            ? "PUT"
            : "POST";


        const resposta = await fetch(url, {

            method: metodo,

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                company_name,
                name,
                jid
            })

        });

        if (!resposta.ok) {

            const erro = await resposta.json();

            if (erro.error?.includes("UNIQUE")) {
                throw new Error("Telefone já cadastrado.");
            }

            throw new Error(erro.error);

        }

        // Fecha o modal
        bootstrap.Modal.getInstance(
            document.getElementById("modalCliente")
        ).hide();

        // Limpa os campos
        document.getElementById("company_name").value = "";
        document.getElementById("name").value = "";
        document.getElementById("jid").value = "";
        clienteEditando = null;

        // Atualiza a tabela e os cards
        carregarClientes();
        carregarDashboard();
        

    } catch (erro) {

        console.error(erro);

        alert(erro.message);

    }

     // Fecha o modal
    bootstrap.Modal.getInstance(
        document.getElementById("modalCliente")
    ).hide();

    // Limpa os campos
    document.getElementById("company_name").value = "";
    document.getElementById("name").value = "";
    document.getElementById("jid").value = "";
    clienteEditando = null;

    alert(
        metodo === "POST"
            ? "Cliente cadastrado com sucesso."
            : "Cliente atualizado com sucesso."
    );

    await carregarClientes();
    await carregarDashboard();
}

function editarCliente(cliente) {

    clienteEditando = cliente.id;

    document.getElementById("company_name").value =
        cliente.company_name ?? "";

    document.getElementById("name").value =
        cliente.name ?? "";

    document.getElementById("jid").value =
        cliente.jid ?? "";

    const modal = new bootstrap.Modal(
        document.getElementById("modalCliente")
    );

    modal.show();

}

async function excluirCliente(id) {

    console.log("Excluir cliente:", id);

    const confirmar = confirm(
        "Tem certeza que deseja excluir este cliente?\n\nEssa ação não pode ser desfeita."
    );

    if (!confirmar) return;

    try {

        const resposta = await fetch(`/api/users/${id}`, {
            method: "DELETE"
        });

        console.log("Status:", resposta.status);

        if (!resposta.ok) {

            const erro = await resposta.json();
            throw new Error(erro.error);

        }

        await carregarClientes();
        await carregarDashboard();

        alert("Cliente excluído com sucesso.");

    } catch (erro) {

        console.error(erro);
        alert(erro.message);

    }

}

function inicializarClientes() {

    const btnSalvar = document.getElementById("btnSalvarCliente");

    if (btnSalvar) {

        btnSalvar.removeEventListener("click", salvarCliente);
        btnSalvar.addEventListener("click", salvarCliente);

    }

}