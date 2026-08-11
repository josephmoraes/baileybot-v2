const paginas = {
  dashboard: { arquivo: "dashboard/dashboard.html", hash: "dashboard" },
  clientes: { arquivo: "clientes/clientes.html", hash: "clientes" },
  campanhas: { arquivo: "campanhas/campanhas.html", hash: "campanhas" },
  mensagens: { arquivo: "mensagens/mensagens.html", hash: "mensagens" },
  templates: {
    arquivo: "mensagens/templates.html",
    hash: "mensagens/templates",
  },
  envio: { arquivo: "mensagens/envio.html", hash: "mensagens/envio" },
  historico: {
    arquivo: "mensagens/historico.html",
    hash: "mensagens/historico",
  },
  "comissoes-dashboard": {
    arquivo: "comissoes/dashboard.html",
    hash: "comissoes/dashboard",
  },
  "comissoes-historico": {
    arquivo: "comissoes/historico.html",
    hash: "comissoes/historico",
  },
  "comissoes-tecnicos": {
    arquivo: "comissoes/tecnicos.html",
    hash: "comissoes/tecnicos",
  },
  "comissoes-solicitacao": {
    arquivo: "comissoes/solicitacao.html",
    hash: "comissoes/solicitacoes",
  },
  "reativacao-resumo": {
    arquivo: "reativacao/resumo.html",
    hash: "reativacao/resumo",
  },
  "reativacao-vendedores": {
    arquivo: "reativacao/vendedores.html",
    hash: "reativacao/vendedores",
  },
  "reativacao-relatorios": {
    arquivo: "reativacao/relatorios.html",
    hash: "reativacao/relatorios",
  },
  configuracoes: {
    arquivo: "configuracoes/configuracoes.html",
    hash: "configuracoes",
  },
};

const Router = {
  paginaAtual: null,
  paginaPeloHash() {
    const caminho =
      location.hash.replace(/^#\/?/, "").replace(/\/$/, "") || "dashboard";
    return (
      Object.entries(paginas).find(
        ([, config]) => config.hash === caminho,
      )?.[0] || "dashboard"
    );
  },

  async carregarPagina(pagina, opcoes = {}) {
    const config = paginas[pagina];
    if (!config) pagina = "dashboard";
    const destino = paginas[pagina];
    const hash = `#/${destino.hash}`;
    if (!opcoes.fromHash && location.hash !== hash) {
      location.hash = hash;
      return;
    }

    const content = document.getElementById("content");
    this.mostrarLoading(true);
    try {
      const resposta = await fetch(`/pages/${destino.arquivo}`);
      if (!resposta.ok) throw new Error("Não foi possível abrir esta tela.");
      content.innerHTML = await resposta.text();
      this.paginaAtual = pagina;
      this.atualizarMenu(pagina);
      await this.inicializarPagina(pagina);
      content.focus({ preventScroll: true });
    } catch (erro) {
      console.error(erro);
      content.innerHTML = `<div class="app-state app-state-error"><i class="bi bi-cloud-slash"></i><h2>Não foi possível carregar a tela</h2><p>${this.textoSeguro(erro.message)}</p><button class="btn btn-success" data-router-retry><i class="bi bi-arrow-clockwise"></i> Tentar novamente</button></div>`;
      content
        .querySelector("[data-router-retry]")
        ?.addEventListener("click", () =>
          this.carregarPagina(pagina, { fromHash: true }),
        );
    } finally {
      this.mostrarLoading(false);
    }
  },

  async inicializarPagina(pagina) {
    const inicializadores = {
      dashboard: () => carregarDashboard?.(),
      clientes: async () => {
        await carregarClientes?.();
        inicializarClientes?.();
      },
      templates: async () => {
        await carregarTemplates?.();
        inicializarTemplates?.();
      },
      envio: () => carregarEnvio?.(),
      historico: async () => {
        await carregarHistorico?.();
        inicializarHistorico?.();
      },
      mensagens: () => inicializarMensagens?.(),
      campanhas: () => inicializarCampanhas?.(),
      configuracoes: () => inicializarConfiguracoes?.(),
      "comissoes-dashboard": () => carregarComissoesDashboard?.(),
      "comissoes-tecnicos": () => inicializarTecnicosComissao?.(),
      "comissoes-historico": () => inicializarHistoricoComissoes?.(),
      "comissoes-solicitacao": () => inicializarSolicitacaoComissao?.(),
      "reativacao-resumo": () => window.inicializarReativacaoResumo?.(),
      "reativacao-vendedores": () => window.inicializarReativacaoVendedores?.(),
      "reativacao-relatorios": () => window.inicializarRelatoriosReativacao?.(),
    };
    await inicializadores[pagina]?.();
  },

  atualizarMenu(pagina) {
    document.querySelectorAll("[data-page]").forEach((link) => {
      link.classList.toggle("active", link.dataset.page === pagina);
      if (link.dataset.page === pagina)
        link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    const grupo = pagina.startsWith("comissoes-")
      ? "submenuComissoes"
      : pagina.startsWith("reativacao-")
        ? "submenuReativacao"
        : ["templates", "envio", "historico"].includes(pagina)
          ? "submenuMensagens"
          : null;
    if (grupo)
      bootstrap.Collapse.getOrCreateInstance(document.getElementById(grupo), {
        toggle: false,
      }).show();
  },

  mostrarLoading(visivel) {
    document.getElementById("appLoading")?.classList.toggle("d-none", !visivel);
    document
      .getElementById("content")
      ?.setAttribute("aria-busy", String(visivel));
  },

  textoSeguro(valor) {
    return String(valor ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  },

  iniciar() {
    document.querySelectorAll("[data-page]").forEach((link) =>
      link.addEventListener("click", (evento) => {
        evento.preventDefault();
        this.carregarPagina(link.dataset.page);
        if (window.innerWidth < 992)
          bootstrap.Collapse.getOrCreateInstance(
            document.getElementById("sidebarMenu"),
            { toggle: false },
          ).hide();
      }),
    );
    window.addEventListener("hashchange", () =>
      this.carregarPagina(this.paginaPeloHash(), { fromHash: true }),
    );
    if (!location.hash) history.replaceState(null, "", "#/dashboard");
    this.carregarPagina(this.paginaPeloHash(), { fromHash: true });
  },
};
