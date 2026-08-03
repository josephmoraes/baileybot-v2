const paginas = {
    dashboard: "dashboard/dashboard.html",
    clientes: "clientes/clientes.html",
    mensagens: "mensagens/mensagens.html",
    templates: "mensagens/templates.html",
    historico: "mensagens/historico.html",
    campanhas: "campanhas/campanhas.html",
    configuracoes: "configuracoes/configuracoes.html",
    envio: "mensagens/envio.html",
    "comissoes-dashboard": "comissoes/dashboard.html",
    "comissoes-historico": "comissoes/historico.html",
    "comissoes-tecnicos": "comissoes/tecnicos.html",
    "comissoes-solicitacao": "comissoes/solicitacao.html",
};

const Router = {

    async carregarPagina(pagina) {

        try {

            const arquivo = paginas[pagina];

            if (!arquivo) {
                throw new Error(`Página "${pagina}" não encontrada.`);
            }

            const resposta = await fetch(`/pages/${arquivo}`);

            if (!resposta.ok) {
                throw new Error("Página não encontrada.");
            }

            const html = await resposta.text();

            document.getElementById("content").innerHTML = html;

            this.atualizarMenu(pagina);

            switch (pagina) {

                case "dashboard":

                    if (typeof carregarDashboard === "function") {
                        await carregarDashboard();
                    }

                    break;

                case "clientes":

                    if (typeof carregarClientes === "function") {
                        await carregarClientes();
                    }

                    if (typeof inicializarClientes === "function") {
                        inicializarClientes();
                    }

                    break;

                case "templates":

                if (typeof carregarTemplates === "function") {
                    await carregarTemplates();
                }

                if (typeof inicializarTemplates === "function") {
                    inicializarTemplates();
                }

                break;

                case "envio":

                    if (typeof carregarEnvio === "function") {
                        await carregarEnvio();
                    }

                    break;

                case "historico":

                    if (typeof carregarHistorico === "function") {
                        await carregarHistorico();
                    }

                    if (typeof inicializarHistorico === "function") {
                        inicializarHistorico();
                    }

                    break;

                case "mensagens":

                    if (typeof inicializarMensagens === "function") {
                        inicializarMensagens();
                    }

                    break;

                case "campanhas":

                    if (typeof inicializarCampanhas === "function") {
                        inicializarCampanhas();
                    }

                    break;

                case "configuracoes":

                    if (typeof inicializarConfiguracoes === "function") {
                        inicializarConfiguracoes();
                    }

                    break;

                case "comissoes-dashboard":
                    await carregarComissoesDashboard();
                    break;
                case "comissoes-tecnicos":
                    await inicializarTecnicosComissao();
                    break;
                case "comissoes-historico":
                    await inicializarHistoricoComissoes();
                    break;
                case "comissoes-solicitacao":
                    await inicializarSolicitacaoComissao();
                    break;

            }

        } catch (erro) {

            console.error(erro);

            document.getElementById("content").innerHTML = `
                <div class="alert alert-danger">
                    Erro ao carregar a página.
                </div>
            `;

        }

    },

    atualizarMenu(pagina) {

        document
            .querySelectorAll("[data-page]")
            .forEach(link => {

                link.classList.remove("active");

                if (link.dataset.page === pagina) {
                    link.classList.add("active");
                }

            });

        if (pagina.startsWith("comissoes-")) {
            bootstrap.Collapse.getOrCreateInstance(
                document.getElementById("submenuComissoes"),
                { toggle: false }
            ).show();
        }

    },

    iniciar() {

        document
            .querySelectorAll("[data-page]")
            .forEach(link => {

                link.addEventListener("click", e => {

                    e.preventDefault();

                    this.carregarPagina(link.dataset.page);

                    if (window.innerWidth < 992) {
                        bootstrap.Collapse.getOrCreateInstance(
                            document.getElementById("sidebarMenu"),
                            { toggle: false }
                        ).hide();
                    }

                });

            });

        this.carregarPagina("dashboard");

    }

};
