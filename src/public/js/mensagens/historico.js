let historicoCache = [];
let paginaHistorico = 1;
let paginacaoHistorico = { pagina: 1, totalPaginas: 1, total: 0 };
let timerPesquisaHistorico = null;

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
    const pesquisa = document.getElementById("pesquisaHistorico")?.value.trim();

    if (status) parametros.set("status", status);
    if (dataInicio) parametros.set("dataInicio", dataInicio);
    if (dataFim) parametros.set("dataFim", dataFim);
    if (pesquisa) parametros.set("pesquisa", pesquisa);
    parametros.set("pagina", paginaHistorico);
    parametros.set("porPagina", "20");

    try {
        const resposta = await fetch(`/api/messages/history?${parametros}`);

        if (!resposta.ok) {
            throw new Error("Erro ao carregar histórico.");
        }

        const dados = await resposta.json();
        historicoCache = dados.itens;
        paginacaoHistorico = dados.paginacao;
        renderizarHistorico(historicoCache);
        atualizarPaginacaoHistorico();
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

function atualizarPaginacaoHistorico() {
    const resumo = document.getElementById("resumoPaginacaoHistorico");
    if (resumo) resumo.textContent = `${paginacaoHistorico.total} registro(s) — página ${paginacaoHistorico.pagina} de ${paginacaoHistorico.totalPaginas}`;
    const anterior = document.getElementById("btnPaginaAnteriorHistorico");
    const proxima = document.getElementById("btnProximaPaginaHistorico");
    if (anterior) anterior.disabled = paginacaoHistorico.pagina <= 1;
    if (proxima) proxima.disabled = paginacaoHistorico.pagina >= paginacaoHistorico.totalPaginas;
}

function inicializarHistorico() {
    document.getElementById("pesquisaHistorico")
        ?.addEventListener("input", () => {
            clearTimeout(timerPesquisaHistorico);
            timerPesquisaHistorico = setTimeout(() => {
                paginaHistorico = 1;
                carregarHistorico();
            }, 300);
        });

    ["filtroStatus", "filtroDataInicio", "filtroDataFim"].forEach(id => {
        document.getElementById(id)?.addEventListener("change", () => {
            paginaHistorico = 1;
            carregarHistorico();
        });
    });

    document.getElementById("btnLimparFiltros")?.addEventListener("click", () => {
        document.getElementById("pesquisaHistorico").value = "";
        document.getElementById("filtroStatus").value = "";
        document.getElementById("filtroDataInicio").value = "";
        document.getElementById("filtroDataFim").value = "";
        paginaHistorico = 1;
        carregarHistorico();
    });

    document.getElementById("btnPaginaAnteriorHistorico")?.addEventListener("click", () => {
        if (paginaHistorico > 1) {
            paginaHistorico -= 1;
            carregarHistorico();
        }
    });
    document.getElementById("btnProximaPaginaHistorico")?.addEventListener("click", () => {
        if (paginaHistorico < paginacaoHistorico.totalPaginas) {
            paginaHistorico += 1;
            carregarHistorico();
        }
    });
}
