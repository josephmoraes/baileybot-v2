let clientesCache = [];

async function importarClientesExcel(arquivo) {
    if (!arquivo) return;
    const base64 = await new Promise((resolve, reject) => {
        const leitor = new FileReader();
        leitor.onload = () => resolve(String(leitor.result).split(",")[1]);
        leitor.onerror = () => reject(new Error("Não foi possível ler a planilha."));
        leitor.readAsDataURL(arquivo);
    });
    const resposta = await fetch("/api/users/import-excel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64 })
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.error || "Erro ao importar planilha.");
    alert(`Importação concluída: ${dados.importados} novo(s), ${dados.duplicados} duplicado(s), ${dados.invalidos} inválido(s).`);
    await carregarClientes();
    await carregarDashboard();
}

async function carregarClientes() {

    try {

        const resposta = await fetch("/api/users");
        const clientes = await resposta.json();
        clientesCache = clientes;

        const tabela = document.getElementById("tabelaClientes");

        tabela.innerHTML = "";

        if (clientes.length === 0) {

            tabela.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center text-secondary py-4">
                        Nenhum cliente cadastrado.
                    </td>
                </tr>
            `;

            return;

        }

        renderizarClientes(clientes);

        } catch (erro) {

            console.error(erro);
            alert(erro.message);

        }
        
        
}

function renderizarClientes(clientes) {

    const tabela = document.getElementById("tabelaClientes");

    tabela.innerHTML = "";

    if (clientes.length === 0) {

        tabela.innerHTML = `
            <tr>
                <td colspan="6" class="text-center text-secondary py-4">
                    Nenhum cliente encontrado.
                </td>
            </tr>
        `;

        return;

    }

    clientes.forEach(cliente => {

        const data = new Date(cliente.created_at).toLocaleDateString("pt-BR");

        tabela.innerHTML += `
            <tr>
                <td>${cliente.customer_code ?? "—"}</td>
                <td>${cliente.company_name ?? ""}</td>
                <td>${cliente.name ?? ""}</td>
               <td>${
                    cliente.jid
                        ? cliente.jid
                            .replace("@s.whatsapp.net", "")
                            .replace(/^55/, "")
                        : ""
                }</td>
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

}

async function salvarCliente() {

    const customer_code = document.getElementById("customer_code").value.trim();
    const company_name = document.getElementById("company_name").value.trim();
    const name = document.getElementById("name").value.trim();
    const telefone = document.getElementById("telefone").value.trim();

    if (!telefone) {
        alert("Informe o telefone.");
        return;
    }

    const telefoneNumeros = telefone.replace(/\D/g, "");

    if (![10, 11].includes(telefoneNumeros.length)) {
        alert("Informe o DDD e o telefone completo: 10 dígitos para residencial ou 11 para celular.");
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
                customer_code,
                company_name,
                name,
                telefone
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
        document.getElementById("customer_code").value = "";
        document.getElementById("company_name").value = "";
        document.getElementById("name").value = "";
        document.getElementById("telefone").value = "";
        
        // Notificação
        alert(
            metodo === "POST"
                ? "Cliente cadastrado com sucesso."
                : "Cliente atualizado com sucesso."
        );

        // Sai do modo edição
        clienteEditando = null;

        // Atualiza a tabela e os cards
        await carregarClientes();
        await carregarDashboard();

    } catch (erro) {

        console.error(erro);
        alert(erro.message);

    }

}

function editarCliente(cliente) {

    clienteEditando = cliente.id;

    document.getElementById("customer_code").value = cliente.customer_code ?? "";

    document.getElementById("company_name").value =
        cliente.company_name ?? "";

    document.getElementById("name").value =
        cliente.name ?? "";

    document.getElementById("telefone").value =
        cliente.jid
            ? cliente.jid
                .replace("@s.whatsapp.net", "")
                .replace(/^55/, "")
            : "";

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

function aplicarMascaraTelefone() {

    const campo = document.getElementById("telefone");

    if (!campo) return;

    campo.addEventListener("input", (e) => {

        let valor = e.target.value.replace(/\D/g, "");

        valor = valor.substring(0, 11);

        if (valor.length > 10) {

            // Celular: (00) 00000-0000
            valor = valor.replace(
                /^(\d{2})(\d{5})(\d{0,4}).*/,
                "($1) $2-$3"
            );

        } else if (valor.length > 6) {

            // Residencial: (00) 0000-0000
            valor = valor.replace(
                /^(\d{2})(\d{4})(\d{0,4}).*/,
                "($1) $2-$3"
            );

        } else if (valor.length > 2) {

            valor = valor.replace(
                /^(\d{2})(\d+)/,
                "($1) $2"
            );

        } else if (valor.length > 0) {

            valor = valor.replace(
                /^(\d+)/,
                "($1"
            );

        }

        e.target.value = valor;

    });

}

function inicializarClientes() {

    const btnSalvar = document.getElementById("btnSalvarCliente");

    if (btnSalvar) {

        btnSalvar.removeEventListener("click", salvarCliente);
        btnSalvar.addEventListener("click", salvarCliente);

    }

    const pesquisa = document.getElementById("pesquisaCliente");

    if (pesquisa) {

        pesquisa.addEventListener("input", (e) => {

            const termo = e.target.value.toLowerCase();

            const resultado = clientesCache.filter(cliente =>

                (cliente.customer_code ?? "").toLowerCase().includes(termo) ||
                (cliente.company_name ?? "").toLowerCase().includes(termo) ||
                (cliente.name ?? "").toLowerCase().includes(termo) ||
                (
                    cliente.jid
                        ?.replace("@s.whatsapp.net", "")
                        .replace(/^55/, "")
                        ?? ""
                ).includes(termo.replace(/\D/g, ""))

            );

            renderizarClientes(resultado);

        });

    }

    aplicarMascaraTelefone();

    const campoArquivo = document.getElementById("arquivoClientesExcel");
    document.getElementById("btnImportarClientes")?.addEventListener("click", () => campoArquivo?.click());
    campoArquivo?.addEventListener("change", async () => {
        try {
            await importarClientesExcel(campoArquivo.files?.[0]);
        } catch (erro) {
            alert(erro.message);
        } finally {
            campoArquivo.value = "";
        }
    });
    document.getElementById("btnExportarClientes")?.addEventListener("click", () => {
        window.location.href = "/api/users/export-excel";
    });

}
