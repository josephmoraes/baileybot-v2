const Router = {

    async carregarPagina(pagina) {

        try {

            const resposta = await fetch(`/pages/${pagina}.html`);

            if (!resposta.ok) {
                throw new Error("Página não encontrada.");
            }

            const html = await resposta.text();

            document.getElementById("content").innerHTML = html;

            this.atualizarMenu(pagina);

            switch (pagina) {

                case "dashboard":

                    await carregarDashboard();

                    break;

                case "clientes":

                    await carregarClientes();

                    inicializarClientes();

                    break;

                case "campanhas":

                    break;

                case "mensagens":

                    break;

                case "configuracoes":

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

    },

    iniciar() {

        document
            .querySelectorAll("[data-page]")
            .forEach(link => {

                link.addEventListener("click", e => {

                    e.preventDefault();

                    this.carregarPagina(link.dataset.page);

                });

            });

        this.carregarPagina("dashboard");

    }

};