let historicoCache = [];

function textoSeguro(valor) {
    return String(valor ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

async function carregarHistorico() {
    const parametros = new URLSearchParams();
    const status = document.getElementById("filtroStatus")?.value;
    const dataInicio = document.getElementById("filtroDataInicio")?.value;
    const dataFim = document.getElementById("filtroDataFim")?.value;

    if (status) parametros.set("status", status);
    if (dataInicio) parametros.set("dataInicio", dataInicio);
    if (dataFim) parametros.set("dataFim", dataFim);

    try {
        const resposta = await fetch(`/api/messages/history?${parametros}`);

        if (!resposta.ok) {
            throw new Error("Erro ao carregar histórico.");
        }

        historicoCache = await resposta.json();
        filtrarPesquisaHistorico();
    } catch (erro) {
        console.error(erro);
        const tabela = document.getElementById("tabelaHistorico");
        if (tabela) {
            tabela.innerHTML = `
                <tr>
                    <td colspan="4" class="text-center text-danger py-4">
                        Erro ao carregar histórico.
                    </td>
                </tr>`;
        }
    }
}

function renderizarHistorico(historico) {
    const tabela = document.getElementById("tabelaHistorico");
    if (!tabela) return;

    tabela.innerHTML = "";

    if (historico.length === 0) {
        tabela.innerHTML = `
            <tr>
                <td colspan="4" class="text-center text-secondary py-4">
                    Nenhuma mensagem encontrada.
                </td>
            </tr>`;
        return;
    }

    historico.forEach(item => {
        const linha = document.createElement("tr");
        const data = new Date(`${item.enviado_em}Z`).toLocaleString("pt-BR");
        const classeStatus = item.status === "enviado" ? "bg-success" : "bg-danger";

        linha.innerHTML = `
            <td>${textoSeguro(item.cliente)}</td>
            <td>${textoSeguro(item.template || "Template excluído")}</td>
            <td><span class="badge ${classeStatus}">${textoSeguro(item.status)}</span></td>
            <td>${textoSeguro(data)}</td>`;

        tabela.appendChild(linha);
    });
}

function filtrarPesquisaHistorico() {
    const termo = document.getElementById("pesquisaHistorico")
        ?.value.toLowerCase().trim() || "";

    const resultado = historicoCache.filter(item =>
        (item.cliente ?? "").toLowerCase().includes(termo) ||
        (item.template ?? "").toLowerCase().includes(termo)
    );

    renderizarHistorico(resultado);
}

function inicializarHistorico() {
    document.getElementById("pesquisaHistorico")
        ?.addEventListener("input", filtrarPesquisaHistorico);

    ["filtroStatus", "filtroDataInicio", "filtroDataFim"].forEach(id => {
        document.getElementById(id)?.addEventListener("change", carregarHistorico);
    });

    document.getElementById("btnLimparFiltros")?.addEventListener("click", () => {
        document.getElementById("pesquisaHistorico").value = "";
        document.getElementById("filtroStatus").value = "";
        document.getElementById("filtroDataInicio").value = "";
        document.getElementById("filtroDataFim").value = "";
        carregarHistorico();
    });
}
