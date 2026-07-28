let historicoCache = [];

async function carregarHistorico() {

    try {

        const resposta = await fetch("/api/messages/history");
        const historico = await resposta.json();

        historicoCache = historico;

        renderizarHistorico(historico);

    } catch (erro) {

        console.error(erro);

        const tabela = document.getElementById("tabelaHistorico");

        tabela.innerHTML = `
            <tr>
                <td colspan="4" class="text-center text-danger py-4">
                    Erro ao carregar histórico.
                </td>
            </tr>
        `;

    }

}

function renderizarHistorico(historico) {

    const tabela = document.getElementById("tabelaHistorico");

    tabela.innerHTML = "";

    if (historico.length === 0) {

        tabela.innerHTML = `
            <tr>
                <td colspan="4" class="text-center text-secondary py-4">
                    Nenhuma mensagem encontrada.
                </td>
            </tr>
        `;

        return;

    }

    historico.forEach(item => {

        const data = new Date(item.enviado_em)
            .toLocaleString("pt-BR");

        const badge = item.status === "enviado"
            ? `<span class="badge bg-success">Enviado</span>`
            : `<span class="badge bg-danger">Erro</span>`;

        tabela.innerHTML += `
            <tr>
                <td>${item.cliente}</td>
                <td>${item.template}</td>
                <td>${badge}</td>
                <td>${data}</td>
            </tr>
        `;

    });

}

function inicializarHistorico() {

    const pesquisa = document.getElementById("pesquisaHistorico");

    if (!pesquisa) return;

    pesquisa.addEventListener("input", e => {

        const termo = e.target.value.toLowerCase();

        const resultado = historicoCache.filter(item =>

            (item.cliente ?? "")
                .toLowerCase()
                .includes(termo)

            ||

            (item.template ?? "")
                .toLowerCase()
                .includes(termo)

        );

        renderizarHistorico(resultado);

    });

}