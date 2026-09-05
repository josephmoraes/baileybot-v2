let clientesCache = [];
let clientesPagina = 1;
let clientesPaginas = 1;
let clientesPesquisaTimer = null;

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
        body: JSON.stringify({ base64, filename: arquivo.name })
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.error || "Erro ao importar planilha.");
    alert(`Importação concluída: ${dados.importados} novo(s), ${dados.duplicados} duplicado(s), ${dados.invalidos} inválido(s).`);
    await carregarClientes();
    await carregarDashboard();
}

async function carregarClientes(page = clientesPagina) {

    try {

        const busca = document.getElementById("pesquisaCliente")?.value || "";
        const resposta = await fetch(`/api/users?page=${page}&perPage=50&search=${encodeURIComponent(busca)}`);
        const dados = await resposta.json();
        const clientes = dados.items;
        clientesCache = clientes; clientesPagina = dados.page; clientesPaginas = dados.pages;
        document.getElementById("clientesPaginacaoResumo").textContent = `${dados.total} cliente(s) • página ${dados.page} de ${dados.pages}`;
        document.getElementById("clientesPaginaAnterior").disabled = dados.page <= 1;
        document.getElementById("clientesPaginaProxima").disabled = dados.page >= dados.pages;

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
                <td><button class="btn btn-link text-light p-0 text-decoration-none" onclick="abrirFichaCompletaCliente(${cliente.id})">${cliente.customer_code ?? "—"}</button></td>
                <td><button class="btn btn-link text-light p-0 text-decoration-none text-start" onclick="abrirFichaCompletaCliente(${cliente.id})">${cliente.company_name || "Nome não informado"}</button></td>
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

function fichaMoeda(valor) {
    return Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fichaData(valor) {
    if (!valor) return "—";
    return new Date(`${String(valor).slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR");
}

function fichaSeguro(valor) {
    return String(valor ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function fichaGrafico(metricas) {
    if (!metricas.length) return '<div class="app-state py-4"><p class="mb-0">Sem métricas importadas.</p></div>';
    const max = Math.max(1, ...metricas.map(item => item.purchased_value));
    return `<div class="client-metrics-chart">${metricas.map(item => `<div class="client-metric-column"><strong>${fichaMoeda(item.purchased_value)}</strong><span style="height:${Math.max(5, item.purchased_value / max * 130)}px" title="${fichaMoeda(item.purchased_value)}"></span><small>${String(item.reference_month).padStart(2, "0")}/${item.reference_year}</small></div>`).join("")}</div>`;
}

async function abrirFichaCompletaCliente(id) {
    const modalElement = document.getElementById("modalFichaCliente");
    if (!modalElement) {
        window.sessionStorage.setItem("abrirFichaCliente", String(id));
        location.hash = "#/clientes";
        return;
    }
    bootstrap.Modal.getOrCreateInstance(modalElement).show();
    document.getElementById("fichaClienteConteudo").innerHTML = '<div class="text-center py-5"><span class="spinner-border"></span></div>';
    try {
        const response = await fetch(`/api/customer-metrics/clients/${id}`);
        const client = await response.json();
        if (!response.ok) throw new Error(client.error || "Não foi possível abrir o cliente.");
        document.getElementById("fichaClienteTitulo").textContent = client.company_name || client.name || `Cliente ${client.customer_code}`;
        const phone = client.jid ? client.jid.replace("@s.whatsapp.net", "").replace(/^55/, "") : "—";
        const badge = client.priority.level === "Alta" ? "danger" : client.priority.level === "Média" ? "warning text-dark" : client.priority.level === "Baixa" ? "success" : "secondary";
        document.getElementById("fichaClienteConteudo").innerHTML = `
          <div class="row g-3 mb-4">
            <div class="col-md-3"><div class="client-detail"><small>Código OG1</small><strong>${fichaSeguro(client.customer_code || "—")}</strong></div></div>
            <div class="col-md-5"><div class="client-detail"><small>Cliente / empresa</small><strong>${fichaSeguro(client.company_name || "Não informado")}</strong></div></div>
            <div class="col-md-4"><div class="client-detail"><small>Contato</small><strong>${fichaSeguro(client.name || "Não informado")}</strong></div></div>
            <div class="col-md-3"><div class="client-detail"><small>Telefone</small><strong>${fichaSeguro(phone)}</strong></div></div>
            <div class="col-md-3"><div class="client-detail"><small>Responsável</small><strong>${fichaSeguro(client.seller || "Outros")}</strong></div></div>
            <div class="col-md-3"><div class="client-detail"><small>Status de reativação</small><strong>${fichaSeguro(client.reactivation_status || "Sem Contato")}</strong></div></div>
            <div class="col-md-3"><div class="client-detail"><small>Próximo contato</small><strong>${fichaData(client.next_contact_at)}</strong></div></div>
          </div>
          <div class="card bg-secondary text-light border-0 mb-4"><div class="card-body"><div class="d-flex flex-wrap justify-content-between gap-2"><div><small class="text-secondary">Prioridade comercial</small><h4><span class="badge bg-${badge}">${fichaSeguro(client.priority.level)}</span> <span class="small text-secondary">${client.priority.score}/100</span></h4></div><p class="mb-0 align-self-center">${fichaSeguro(client.priority.reason)}</p></div></div></div>
          <div class="row g-3 mb-4"><div class="col-lg-6"><div class="card bg-secondary text-light border-0 h-100"><div class="card-header"><strong>Produtos e anotações de métricas</strong></div><div class="card-body"><label for="fichaProdutosPrincipais" class="form-label">Principais produtos</label><textarea id="fichaProdutosPrincipais" class="form-control mb-3" rows="3">${fichaSeguro(client.main_products || "")}</textarea><label for="fichaProdutosUltimos" class="form-label">Últimos produtos comprados</label><textarea id="fichaProdutosUltimos" class="form-control mb-3" rows="3">${fichaSeguro(client.latest_products || "")}</textarea><label for="fichaNotasMetricas" class="form-label">Anotações sobre o cliente</label><textarea id="fichaNotasMetricas" class="form-control mb-3" rows="4" placeholder="Contatos, contexto e próximos passos...">${fichaSeguro(client.metric_notes || "")}</textarea><button class="btn btn-success" type="button" onclick="salvarProdutosCliente(${client.id})">Salvar informações</button></div></div></div><div class="col-lg-6"><div class="card bg-secondary text-light border-0 h-100"><div class="card-header"><strong>Informações de reativação</strong></div><div class="card-body"><p><small class="text-secondary d-block">Última movimentação</small>${fichaData(client.last_movement_at)} — ${fichaMoeda(client.last_movement_value)}</p><p><small class="text-secondary d-block">Valor acumulado</small>${fichaMoeda(client.accumulated_value)}</p><p class="mb-0"><small class="text-secondary d-block">Observação</small>${fichaSeguro(client.reactivation_notes || "Sem observação")}</p></div></div></div></div>
          <div class="card bg-secondary text-light border-0 mb-4"><div class="card-header"><strong>Crescimento ou diminuição</strong></div><div class="card-body">${fichaGrafico(client.metrics)}</div></div>
          <div class="card bg-secondary text-light border-0"><div class="card-header"><strong>Histórico mensal</strong></div><div class="table-responsive"><table class="table table-dark mb-0"><thead><tr><th>Período</th><th>Vendedor</th><th>Valor comprado</th><th>Pedidos</th><th>Média por pedido</th></tr></thead><tbody>${client.metrics.length ? client.metrics.map(item => `<tr><td>${String(item.reference_month).padStart(2, "0")}/${item.reference_year}</td><td>${fichaSeguro(item.report_seller || item.seller)}</td><td>${fichaMoeda(item.purchased_value)}</td><td>${Number(item.order_count).toLocaleString("pt-BR")}</td><td>${fichaMoeda(item.average_order_value)}</td></tr>`).join("") : '<tr><td colspan="5" class="text-center text-secondary py-4">Sem métricas importadas.</td></tr>'}</tbody></table></div></div>`;
    } catch (error) {
        document.getElementById("fichaClienteConteudo").innerHTML = `<div class="alert alert-danger">${fichaSeguro(error.message)}</div>`;
    }
}

async function salvarProdutosCliente(id) {
    try {
        const response = await fetch(`/api/customer-metrics/clients/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ main_products: document.getElementById("fichaProdutosPrincipais").value, latest_products: document.getElementById("fichaProdutosUltimos").value, metric_notes: document.getElementById("fichaNotasMetricas").value, metric_status: document.getElementById("fichaStatusMetricas")?.value || undefined }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Não foi possível salvar os produtos.");
        alert("Informações salvas na ficha do cliente.");
    } catch (error) { alert(error.message); }
}

async function salvarCliente() {

    const customer_code = document.getElementById("customer_code").value.trim();
    const company_name = document.getElementById("company_name").value.trim();
    const name = document.getElementById("name").value.trim();
    const telefone = document.getElementById("telefone").value.trim();

    if (!customer_code && !company_name && !name) {
        alert("Informe o código, o nome ou a empresa do cliente.");
        return;
    }

    const telefoneNumeros = telefone.replace(/\D/g, "");

    if (telefone && ![10, 11].includes(telefoneNumeros.length)) {
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

        pesquisa.addEventListener("input", () => {
            clearTimeout(clientesPesquisaTimer);
            clientesPesquisaTimer = setTimeout(() => carregarClientes(1), 250);
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
    document.getElementById("clientesPaginaAnterior")?.addEventListener("click", () => carregarClientes(Math.max(1, clientesPagina - 1)));
    document.getElementById("clientesPaginaProxima")?.addEventListener("click", () => carregarClientes(Math.min(clientesPaginas, clientesPagina + 1)));

    const pendingClient = window.sessionStorage.getItem("abrirFichaCliente");
    if (pendingClient) {
        window.sessionStorage.removeItem("abrirFichaCliente");
        abrirFichaCompletaCliente(Number(pendingClient));
    }

}
