let campanhasCache = [];
let campanhaEditando = null;
let modalCampanha = null;

let modalDestinatarios = null;
let campanhaSelecionando = null;
let clientesCampanhaCache = [];
let clientesSelecionados = new Set();
let modalValidacaoCampanha = null;
let campanhaEmValidacao = null;
let resultadoValidacaoCache = null;
let filtroValidacaoAtual = "problemas";
let modalDetalhesCampanha = null;
let clientesComMensagemEnviada = new Set();
let campanhaDetalhesAtual = null;
let monitorDetalhesCampanha = null;

function atualizarProgressoEnvio(campanha) {
    const painel = document.getElementById("progressoEnvioCampanha");
    if (!painel) return;
    const emAndamento = ["processando", "cancelando"].includes(campanha?.status);
    painel.classList.toggle("d-none", !emAndamento);
    if (!emAndamento) return;

    const total = Number(campanha.progress_total || 0);
    const processados = Number(campanha.progress_processed || 0);
    const restanteMs = campanha.next_send_at
        ? Math.max(0, new Date(campanha.next_send_at).getTime() - Date.now())
        : 0;
    const cooldownMs = Number(campanha.cooldown_ms || 0);
    const parteCooldown = cooldownMs > 0 ? 1 - (restanteMs / cooldownMs) : 0;
    const progresso = total > 0
        ? Math.min(100, ((processados + Math.max(0, parteCooldown)) / total) * 100)
        : 0;

    document.getElementById("textoProgressoEnvio").textContent = `${processados} de ${total} contato(s) processado(s)`;
    document.getElementById("percentualProgressoEnvio").textContent = `${Math.round(progresso)}%`;
    document.getElementById("barraProgressoEnvio").style.width = `${progresso}%`;
    document.getElementById("proximoContatoEnvio").textContent = campanha.current_recipient
        ? `Próximo contato: ${campanha.current_recipient}`
        : "Preparando próximo contato...";
    document.getElementById("temporizadorProximoEnvio").textContent = restanteMs > 0
        ? `Próximo envio em ${Math.ceil(restanteMs / 1000)}s`
        : "Enviando agora...";
}

function iniciarMonitorDetalhes(campaignId) {
    clearInterval(monitorDetalhesCampanha);
    monitorDetalhesCampanha = setInterval(async () => {
        try {
            const resposta = await fetch(`/api/campaigns/${campaignId}`);
            if (!resposta.ok) return;
            const campanha = await resposta.json();
            campanhaDetalhesAtual = { ...campanhaDetalhesAtual, ...campanha };
            atualizarProgressoEnvio(campanhaDetalhesAtual);
            if (!["processando", "cancelando"].includes(campanha.status)) {
                clearInterval(monitorDetalhesCampanha);
                await carregarCampanhas();
            }
        } catch (erro) {
            console.error(erro);
        }
    }, 1000);
}

function mostrarAlertaCampanha(mensagem, tipo = "success") {
    const alerta = document.getElementById("alertaCampanha");

    if (!alerta) return;

    alerta.className = `alert alert-${tipo}`;
    alerta.textContent = mensagem;

    setTimeout(() => {
        alerta.classList.add("d-none");
    }, 4000);
}

function criarCelulaCampanha(valor) {
    const celula = document.createElement("td");

    celula.textContent = valor ?? "";

    return celula;
}

function renderizarCampanhas(campanhas) {
    const tabela = document.getElementById("tabelaCampanhas");

    if (!tabela) return;

    tabela.innerHTML = "";

    if (campanhas.length === 0) {
        const linha = document.createElement("tr");
        const celula = document.createElement("td");

        celula.colSpan = 7;
        celula.className =
            "text-center text-secondary py-4";

        celula.textContent =
            "Nenhuma campanha cadastrada.";

        linha.appendChild(celula);
        tabela.appendChild(linha);

        return;
    }

    campanhas.forEach(campanha => {
        const linha = document.createElement("tr");
        linha.style.cursor = "pointer";
        linha.title = "Clique para ver os contatos e detalhes da campanha";
        linha.addEventListener("click", () => abrirDetalhesCampanha(campanha));

        linha.appendChild(
            criarCelulaCampanha(campanha.nome)
        );

        linha.appendChild(
            criarCelulaCampanha(campanha.template_nome)
        );

        const celulaStatus = document.createElement("td");
        const status = document.createElement("span");

        const classesStatus = {
            rascunho: "bg-secondary",
            processando: "bg-warning text-dark",
            cancelando: "bg-warning text-dark",
            cancelada: "bg-dark border border-light",
            concluida: "bg-success",
            parcial: "bg-danger"
        };
        status.className = `badge ${classesStatus[campanha.status] || "bg-primary"}`;

        const nomesStatus = {
            rascunho: "Rascunho",
            processando: "Processando",
            cancelando: "Cancelando",
            cancelada: "Cancelada",
            concluida: "Concluída",
            parcial: "Parcial"
        };
        status.textContent = nomesStatus[campanha.status] || campanha.status;

        celulaStatus.appendChild(status);

        const statusValidacao = document.createElement("div");
        statusValidacao.className = "small mt-1";
        statusValidacao.textContent = campanha.status === "concluida"
            ? "Pode ser reutilizada"
            : campanha.validation_status === "validada"
                ? `${campanha.total_validos} válido(s) verificado(s)`
                : campanha.validation_status === "validando"
                    ? "Validando contatos..."
                    : "Validação feita ao iniciar";
        statusValidacao.classList.add(
            campanha.status === "concluida"
                ? "text-info"
                : campanha.validation_status === "validada"
                    ? "text-success"
                    : "text-warning"
        );
        celulaStatus.appendChild(statusValidacao);
        linha.appendChild(celulaStatus);

        linha.appendChild(
            criarCelulaCampanha(
                campanha.total_destinatarios
            )
        );

        linha.appendChild(
            criarCelulaCampanha(
                campanha.total_enviados
            )
        );

        const data = new Date(
            `${campanha.created_at}Z`
        ).toLocaleString("pt-BR");

        linha.appendChild(
            criarCelulaCampanha(data)
        );

        const celulaAcoes = document.createElement("td");
        const btnSelecionarClientes = document.createElement("button");
        btnSelecionarClientes.type = "button";
        btnSelecionarClientes.className = "btn btn-sm btn-primary me-2";
        btnSelecionarClientes.title = "Adicionar contatos";
        btnSelecionarClientes.innerHTML = '<i class="bi bi-person-plus"></i>';
        btnSelecionarClientes.addEventListener("click", evento => {
            evento.stopPropagation();
            abrirDestinatarios(campanha.id);
        });

        const btnExcluir = document.createElement("button");
        btnExcluir.type = "button";
        btnExcluir.className = "btn btn-sm btn-danger";
        btnExcluir.title = "Excluir campanha";
        btnExcluir.innerHTML = '<i class="bi bi-trash"></i>';
        btnExcluir.addEventListener("click", evento => {
            evento.stopPropagation();
            excluirCampanha(campanha.id);
        });

        if (!["processando", "cancelando"].includes(campanha.status)) {
            celulaAcoes.appendChild(btnSelecionarClientes);
            celulaAcoes.appendChild(btnExcluir);
        }
        linha.appendChild(celulaAcoes);

        tabela.appendChild(linha);
    });
}

function atualizarResumoCampanhas() {
    const total = document.getElementById("totalCampanhasLista");
    const rascunhos = document.getElementById("totalCampanhasRascunho");

    if (total) total.textContent = campanhasCache.length;
    if (rascunhos) {
        rascunhos.textContent = campanhasCache.filter(
            campanha => campanha.status === "rascunho"
        ).length;
    }
}

function nomeStatusValidacao(status) {
    return {
        valido: "Válido",
        sem_whatsapp: "Sem WhatsApp",
        telefone_invalido: "Telefone inválido",
        bloqueado: "Bloqueado",
        erro_validacao: "Erro na validação",
        ja_enviado: "Mensagem já enviada",
        nao_validado: "Não validado"
    }[status] || status;
}

function situacaoDestinatario(item) {
    if (item.status === "enviado") return "Mensagem já enviada";
    if (item.status === "erro") return "Erro no envio";
    if (item.status === "bloqueado" || item.validation_status === "bloqueado") return "Bloqueado";
    if (item.validation_status && item.validation_status !== "nao_validado") {
        return nomeStatusValidacao(item.validation_status);
    }
    return "Pendente";
}

async function abrirDetalhesCampanha(campanha) {
    campanhaDetalhesAtual = campanha;
    document.getElementById("tituloDetalhesCampanha").textContent = campanha.nome;
    document.getElementById("resumoDetalhesCampanha").textContent =
        `${campanha.template_nome} · ${campanha.total_destinatarios} contato(s)`;
    document.getElementById("carregandoDetalhesCampanha").classList.remove("d-none");
    document.getElementById("conteudoDetalhesCampanha").classList.add("d-none");

    const emProcessamento = ["processando", "cancelando"].includes(campanha.status);
    atualizarProgressoEnvio(campanha);
    if (emProcessamento) iniciarMonitorDetalhes(campanha.id);
    else clearInterval(monitorDetalhesCampanha);
    const btnEditar = document.getElementById("btnEditarCampanhaDetalhes");
    const btnContatos = document.getElementById("btnContatosCampanhaDetalhes");
    const btnIniciar = document.getElementById("btnIniciarCampanhaDetalhes");
    const btnCancelar = document.getElementById("btnCancelarCampanhaDetalhes");

    btnEditar.classList.toggle("d-none", emProcessamento);
    btnContatos.classList.toggle("d-none", emProcessamento);
    btnIniciar.classList.toggle("d-none", emProcessamento);
    btnIniciar.disabled = Number(campanha.total_destinatarios) === 0;
    btnIniciar.title = btnIniciar.disabled ? "Adicione contatos antes de iniciar" : "";
    btnIniciar.innerHTML = campanha.status === "concluida"
        ? '<i class="bi bi-arrow-repeat me-1"></i> Reutilizar campanha'
        : '<i class="bi bi-send me-1"></i> Iniciar campanha';
    btnCancelar.classList.toggle("d-none", !emProcessamento);
    btnCancelar.disabled = campanha.status === "cancelando";
    btnCancelar.textContent = campanha.status === "cancelando"
        ? "Cancelamento solicitado..."
        : "Cancelar campanha";

    modalDetalhesCampanha.show();

    try {
        const resposta = await fetch(`/api/campaigns/${campanha.id}/recipients`);
        const destinatarios = await resposta.json();

        if (!resposta.ok) {
            throw new Error(destinatarios.error || "Não foi possível carregar os contatos.");
        }

        const tabela = document.getElementById("tabelaDetalhesCampanha");
        tabela.innerHTML = "";

        destinatarios.forEach(item => {
            const linha = document.createElement("tr");
            const telefone = String(item.cliente_jid || "")
                .replace("@s.whatsapp.net", "")
                .replace(/^55/, "");
            const dataEnvio = item.enviado_em
                ? new Date(`${item.enviado_em}Z`).toLocaleString("pt-BR")
                : "";

            [
                item.cliente_nome,
                telefone,
                situacaoDestinatario(item),
                item.erro || item.validation_error || "",
                dataEnvio
            ].forEach(valor => {
                const celula = document.createElement("td");
                celula.textContent = valor || "";
                linha.appendChild(celula);
            });

            tabela.appendChild(linha);
        });

        if (destinatarios.length === 0) {
            tabela.innerHTML = '<tr><td colspan="5" class="text-center text-secondary py-4">Nenhum contato nesta campanha.</td></tr>';
        }

        document.getElementById("carregandoDetalhesCampanha").classList.add("d-none");
        document.getElementById("conteudoDetalhesCampanha").classList.remove("d-none");
    } catch (erro) {
        const carregando = document.getElementById("carregandoDetalhesCampanha");
        carregando.innerHTML = "";
        const alerta = document.createElement("div");
        alerta.className = "alert alert-danger";
        alerta.textContent = erro.message;
        carregando.appendChild(alerta);
    }
}

function editarCampanhaPelosDetalhes() {
    if (!campanhaDetalhesAtual) return;
    const id = campanhaDetalhesAtual.id;
    modalDetalhesCampanha.hide();
    setTimeout(() => editarCampanha(id), 200);
}

function iniciarCampanhaPelosDetalhes() {
    if (!campanhaDetalhesAtual) return;
    const campanha = campanhaDetalhesAtual;
    modalDetalhesCampanha.hide();
    setTimeout(() => validarCampanha(campanha), 200);
}

function cancelarCampanhaPelosDetalhes() {
    if (!campanhaDetalhesAtual) return;
    cancelarCampanha(campanhaDetalhesAtual);
}

async function cancelarCampanha(campanha) {
    if (!confirm(`Cancelar a campanha “${campanha.nome}”?\n\nA mensagem que já estiver sendo enviada será concluída. Os próximos contatos serão interrompidos.`)) {
        return;
    }

    try {
        const resposta = await fetch(`/api/campaigns/${campanha.id}/cancel`, {
            method: "POST"
        });
        const dados = await resposta.json();

        if (!resposta.ok) throw new Error(dados.error || "Não foi possível cancelar a campanha.");

        mostrarAlertaCampanha(dados.message, "warning");
        await carregarCampanhas();
    } catch (erro) {
        mostrarAlertaCampanha(erro.message, "danger");
    }
}

function renderizarResultadoValidacao() {
    const tabela = document.getElementById("tabelaResultadoValidacao");
    if (!tabela || !resultadoValidacaoCache) return;

    const destinatarios = resultadoValidacaoCache.destinatarios.filter(item => {
        if (filtroValidacaoAtual === "validos") return item.validation_status === "valido";
        if (filtroValidacaoAtual === "enviados") return item.validation_status === "ja_enviado";
        if (filtroValidacaoAtual === "problemas") return !["valido", "ja_enviado"].includes(item.validation_status);
        return true;
    });

    tabela.innerHTML = "";

    if (destinatarios.length === 0) {
        const linha = document.createElement("tr");
        const celula = document.createElement("td");
        celula.colSpan = 4;
        celula.className = "text-center text-secondary py-4";
        celula.textContent = "Nenhum contato nesta categoria.";
        linha.appendChild(celula);
        tabela.appendChild(linha);
        return;
    }

    destinatarios.forEach(item => {
        const linha = document.createElement("tr");
        const telefone = String(item.cliente_jid || "")
            .replace("@s.whatsapp.net", "")
            .replace(/^55/, "");

        [
            item.cliente_nome,
            telefone,
            nomeStatusValidacao(item.validation_status),
            item.validation_error || (item.validation_status === "valido" ? "Pronto para envio" : "")
        ].forEach(valor => {
            const celula = document.createElement("td");
            celula.textContent = valor || "";
            linha.appendChild(celula);
        });

        tabela.appendChild(linha);
    });
}

function mostrarResumoValidacao(resultado) {
    const resumo = resultado.resumo;
    const valores = {
        validacaoSelecionados: resumo.selecionados,
        validacaoValidos: resumo.validos,
        validacaoSemWhatsapp: resumo.semWhatsapp,
        validacaoInvalidos: resumo.telefoneInvalido,
        validacaoBloqueados: resumo.bloqueados,
        validacaoErros: resumo.erros,
        validacaoJaEnviados: resumo.jaEnviados
    };

    Object.entries(valores).forEach(([id, valor]) => {
        const elemento = document.getElementById(id);
        if (elemento) elemento.textContent = valor;
    });

    document.getElementById("progressoValidacaoCampanha")?.classList.add("d-none");
    document.getElementById("resultadoValidacaoCampanha")?.classList.remove("d-none");

    const botaoContinuar = document.getElementById("btnContinuarCampanhaValidada");
    if (botaoContinuar) {
        botaoContinuar.classList.toggle("d-none", resumo.validos === 0);
        botaoContinuar.textContent = `Continuar com ${resumo.validos} válido(s)`;
    }

    filtroValidacaoAtual = "problemas";
    document.querySelectorAll("[data-filtro-validacao]").forEach(botao => {
        botao.classList.toggle("active", botao.dataset.filtroValidacao === "problemas");
    });
    renderizarResultadoValidacao();
}

async function validarCampanha(campanha) {
    campanhaEmValidacao = campanha;
    resultadoValidacaoCache = null;
    document.getElementById("nomeCampanhaValidacao").textContent = campanha.nome;

    const progresso = document.getElementById("progressoValidacaoCampanha");
    progresso.className = "text-center py-5";
    progresso.innerHTML = `
        <div class="spinner-border text-success mb-3" role="status"></div>
        <h5>Consultando os contatos no WhatsApp...</h5>
        <p class="text-secondary mb-0">Mantenha o BaileyBot conectado até a validação terminar.</p>
    `;

    document.getElementById("resultadoValidacaoCampanha").classList.add("d-none");
    document.getElementById("btnContinuarCampanhaValidada").classList.add("d-none");
    modalValidacaoCampanha.show();

    try {
        const resposta = await fetch(`/api/campaigns/${campanha.id}/validate`, {
            method: "POST"
        });
        const dados = await resposta.json();

        if (!resposta.ok) {
            throw new Error(dados.error || "Não foi possível validar os contatos.");
        }

        resultadoValidacaoCache = dados;
        campanhaEmValidacao = {
            ...campanha,
            validation_status: "validada",
            total_validos: dados.resumo.validos,
            total_invalidos: dados.resumo.selecionados - dados.resumo.validos
        };
        mostrarResumoValidacao(dados);
        await carregarCampanhas();
    } catch (erro) {
        progresso.innerHTML = "";
        const alerta = document.createElement("div");
        alerta.className = "alert alert-danger mb-0";
        alerta.textContent = erro.message;
        progresso.appendChild(alerta);
    }
}

function continuarCampanhaValidada() {
    if (!campanhaEmValidacao || !resultadoValidacaoCache?.resumo?.validos) return;
    modalValidacaoCampanha.hide();
    enviarCampanha(campanhaEmValidacao);
}

async function enviarCampanha(campanha) {
    const texto = `Enviar “${campanha.nome}” para ${campanha.total_validos} novo(s) contato(s) válido(s)?\n\nQuem já recebeu mensagem nesta campanha será ignorado. Mantenha o BaileyBot aberto até o término.`;

    if (!confirm(texto)) return;

    mostrarAlertaCampanha("Campanha em processamento. Aguarde...", "warning");

    let monitorEnvio = null;

    try {
        const requisicao = fetch(`/api/campaigns/${campanha.id}/send`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ somenteErros: false })
        });
        setTimeout(() => carregarCampanhas(), 300);
        setTimeout(async () => {
            await carregarCampanhas();
            const atualizada = campanhasCache.find(item => item.id === campanha.id);
            if (atualizada) abrirDetalhesCampanha(atualizada);
        }, 500);
        monitorEnvio = setInterval(() => carregarCampanhas(), 2000);

        const resposta = await requisicao;
        const dados = await resposta.json();
        if (!resposta.ok) throw new Error(dados.error || "Erro ao enviar campanha.");

        mostrarAlertaCampanha(
            dados.cancelada
                ? `Campanha cancelada: ${dados.enviados} enviado(s) nesta execução.`
                : `Campanha finalizada: ${dados.enviados} enviado(s), ${dados.erros} erro(s), ${dados.bloqueados || 0} bloqueado(s).`,
            dados.cancelada || dados.erros ? "warning" : "success"
        );
        if (dados.notificarConclusao && "Notification" in window && Notification.permission === "granted") {
            new Notification("BaileyBot — campanha finalizada", {
                body: `${campanha.nome}: ${dados.enviados} enviado(s), ${dados.erros} erro(s).`
            });
        }
        await carregarCampanhas();
        await carregarDashboard();
    } catch (erro) {
        mostrarAlertaCampanha(erro.message, "danger");
        await carregarCampanhas();
    } finally {
        if (monitorEnvio) clearInterval(monitorEnvio);
    }
}

function filtrarCampanhas() {
    const termo = document.getElementById("pesquisaCampanha")
        ?.value.toLowerCase().trim() || "";

    renderizarCampanhas(campanhasCache.filter(campanha =>
        campanha.nome.toLowerCase().includes(termo) ||
        (campanha.template_nome || "").toLowerCase().includes(termo)
    ));
}

async function carregarCampanhas() {
    try {
        const resposta = await fetch("/api/campaigns");
        const dados = await resposta.json();

        if (!resposta.ok) {
            throw new Error(
                dados.error ||
                "Erro ao carregar campanhas."
            );
        }

        campanhasCache = dados;

        atualizarResumoCampanhas();
        filtrarCampanhas();
    } catch (erro) {
        console.error(erro);

        mostrarAlertaCampanha(
            erro.message,
            "danger"
        );
    }
}

async function carregarTemplatesCampanha() {
    const select =
        document.getElementById("templateCampanha");

    if (!select) return;

    try {
        const resposta = await fetch(
            "/api/messages/templates"
        );

        const templates = await resposta.json();

        if (!resposta.ok) {
            throw new Error(
                "Erro ao carregar templates."
            );
        }

        select.innerHTML =
            '<option value="">Selecione um template</option>';

        templates
            .filter(template => template.ativo)
            .forEach(template => {
                const option =
                    document.createElement("option");

                option.value = template.id;
                option.textContent = template.nome;

                select.appendChild(option);
            });
    } catch (erro) {
        console.error(erro);

        select.innerHTML =
            '<option value="">Erro ao carregar</option>';
    }
}

function abrirNovaCampanha() {
    campanhaEditando = null;

    document.getElementById(
        "tituloModalCampanha"
    ).textContent = "Nova campanha";

    document.getElementById(
        "nomeCampanha"
    ).value = "";

    document.getElementById(
        "templateCampanha"
    ).value = "";

    modalCampanha.show();
}

function editarCampanha(id) {
    const campanha = campanhasCache.find(
        item => item.id === id
    );

    if (!campanha) {
        mostrarAlertaCampanha(
            "Campanha não encontrada.",
            "danger"
        );

        return;
    }

    campanhaEditando = campanha.id;

    document.getElementById(
        "tituloModalCampanha"
    ).textContent = "Editar campanha";

    document.getElementById(
        "nomeCampanha"
    ).value = campanha.nome;

    document.getElementById(
        "templateCampanha"
    ).value = campanha.template_id;

    modalCampanha.show();
}

async function salvarCampanha() {
    const nome = document
        .getElementById("nomeCampanha")
        .value
        .trim();

    const templateId = Number(
        document.getElementById(
            "templateCampanha"
        ).value
    );

    if (!nome) {
        mostrarAlertaCampanha(
            "Informe o nome da campanha.",
            "warning"
        );

        return;
    }

    if (!templateId) {
        mostrarAlertaCampanha(
            "Selecione um template.",
            "warning"
        );

        return;
    }

    const botao =
        document.getElementById("btnSalvarCampanha");

    botao.disabled = true;
    botao.textContent = "Salvando...";

    try {
        const url = campanhaEditando
            ? `/api/campaigns/${campanhaEditando}`
            : "/api/campaigns";

        const metodo = campanhaEditando
            ? "PUT"
            : "POST";

        const resposta = await fetch(url, {
            method: metodo,

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                nome,
                templateId
            })
        });

        const dados = await resposta.json();

        if (!resposta.ok) {
            throw new Error(
                dados.error ||
                "Erro ao salvar campanha."
            );
        }

        modalCampanha.hide();

        mostrarAlertaCampanha(
            campanhaEditando
                ? "Campanha atualizada."
                : "Campanha criada."
        );

        campanhaEditando = null;

        await carregarCampanhas();
        await carregarDashboard();
    } catch (erro) {
        console.error(erro);

        mostrarAlertaCampanha(
            erro.message,
            "danger"
        );
    } finally {
        botao.disabled = false;
        botao.textContent = "Salvar";
    }
}

async function excluirCampanha(id) {
    const confirmou = confirm(
        "Deseja realmente excluir esta campanha?"
    );

    if (!confirmou) return;

    try {
        const resposta = await fetch(
            `/api/campaigns/${id}`,
            {
                method: "DELETE"
            }
        );

        const dados = await resposta.json();

        if (!resposta.ok) {
            throw new Error(
                dados.error ||
                "Erro ao excluir campanha."
            );
        }

        mostrarAlertaCampanha(
            "Campanha excluída."
        );

        await carregarCampanhas();
        await carregarDashboard();
    } catch (erro) {
        console.error(erro);

        mostrarAlertaCampanha(
            erro.message,
            "danger"
        );
    }
}

function atualizarTotalSelecionados() {
    const total = clientesSelecionados.size;

    const elemento = document.getElementById(
        "totalDestinatariosSelecionados"
    );

    if (elemento) {
        elemento.textContent =
            `${total} cliente${total === 1 ? "" : "s"} selecionado${total === 1 ? "" : "s"}`;
    }

    const selecionarTodos = document.getElementById(
        "selecionarTodosDestinatarios"
    );

    if (selecionarTodos) {
        selecionarTodos.checked =
            clientesCampanhaCache.length > 0 &&
            clientesCampanhaCache.every(cliente =>
                clientesSelecionados.has(cliente.id)
            );
    }
}

function renderizarClientesCampanha(clientes) {
    const lista = document.getElementById(
        "listaDestinatarios"
    );

    if (!lista) return;

    lista.innerHTML = "";

    if (clientes.length === 0) {
        lista.innerHTML = `
            <div class="text-center text-secondary py-4">
                Nenhum cliente encontrado.
            </div>
        `;

        return;
    }

    clientes.forEach(cliente => {
        const container = document.createElement("div");

        container.className =
            "form-check border-bottom border-secondary py-3 px-4";

        const checkbox = document.createElement("input");

        checkbox.className = "form-check-input";
        checkbox.type = "checkbox";
        checkbox.value = cliente.id;
        checkbox.id = `clienteCampanha-${cliente.id}`;
        checkbox.checked =
            clientesSelecionados.has(cliente.id);

        checkbox.addEventListener("change", () => {
            if (checkbox.checked) {
                clientesSelecionados.add(cliente.id);
            } else {
                clientesSelecionados.delete(cliente.id);
            }

            atualizarTotalSelecionados();
        });

        const label = document.createElement("label");

        label.className =
            "form-check-label w-100";

        label.htmlFor = checkbox.id;

        const nome = document.createElement("div");

        nome.className = "fw-semibold";
        nome.textContent =
            cliente.name || "Cliente sem nome";

        const detalhes = document.createElement("div");

        detalhes.className =
            "small text-secondary";

        const telefone = cliente.jid
            ?.replace("@s.whatsapp.net", "")
            .replace(/^55/, "") || "";

        detalhes.textContent = [
            cliente.company_name,
            telefone,
            clientesComMensagemEnviada.has(cliente.id) ? "Mensagem já enviada" : null
        ]
            .filter(Boolean)
            .join(" — ");

        label.appendChild(nome);
        label.appendChild(detalhes);

        container.appendChild(checkbox);
        container.appendChild(label);

        lista.appendChild(container);
    });

    atualizarTotalSelecionados();
}

function pesquisarDestinatarios() {
    const termo = document
        .getElementById("pesquisaDestinatarios")
        .value
        .toLowerCase()
        .trim();

    const numerosPesquisa =
        termo.replace(/\D/g, "");

    const resultado =
        clientesCampanhaCache.filter(cliente => {
            const nome =
                (cliente.name || "").toLowerCase();

            const empresa =
                (cliente.company_name || "")
                    .toLowerCase();

            const telefone =
                (cliente.jid || "")
                    .replace("@s.whatsapp.net", "")
                    .replace(/^55/, "");

            return (
                nome.includes(termo) ||
                empresa.includes(termo) ||
                (
                    numerosPesquisa &&
                    telefone.includes(numerosPesquisa)
                )
            );
        });

    renderizarClientesCampanha(resultado);
}

async function abrirDestinatarios(campaignId) {
    campanhaSelecionando = campaignId;
    clientesSelecionados = new Set();

    const campanha = campanhasCache.find(
        item => item.id === campaignId
    );

    document.getElementById(
        "nomeCampanhaDestinatarios"
    ).textContent = campanha?.nome || "";

    document.getElementById(
        "pesquisaDestinatarios"
    ).value = "";

    document.getElementById(
        "listaDestinatarios"
    ).innerHTML = `
        <div class="text-center text-secondary py-4">
            Carregando clientes...
        </div>
    `;

    modalDestinatarios.show();

    try {
        const [
            respostaClientes,
            respostaSelecionados
        ] = await Promise.all([
            fetch("/api/users"),
            fetch(
                `/api/campaigns/${campaignId}/recipients`
            )
        ]);

        const clientes =
            await respostaClientes.json();

        const selecionados =
            await respostaSelecionados.json();

        if (
            !respostaClientes.ok ||
            !respostaSelecionados.ok
        ) {
            throw new Error(
                "Erro ao carregar os clientes."
            );
        }

        clientesCampanhaCache = clientes;

        clientesSelecionados = new Set(
            selecionados
                .map(item => Number(item.cliente_id))
        );
        clientesComMensagemEnviada = new Set(
            selecionados
                .filter(item => item.status === "enviado")
                .map(item => Number(item.cliente_id))
        );

        renderizarClientesCampanha(
            clientesCampanhaCache
        );
    } catch (erro) {
        console.error(erro);

        document.getElementById(
            "listaDestinatarios"
        ).innerHTML = `
            <div class="alert alert-danger">
                ${erro.message}
            </div>
        `;
    }
}

async function cadastrarClienteNaCampanha() {
    const nome = document.getElementById("novoClienteNomeCampanha").value.trim();
    const company_name = document.getElementById("novoClienteEmpresaCampanha").value.trim();
    const telefone = document.getElementById("novoClienteTelefoneCampanha").value.trim();
    const digitos = telefone.replace(/\D/g, "");

    if (!nome && !company_name) {
        mostrarAlertaCampanha("Informe o nome ou a empresa do contato.", "warning");
        return;
    }
    if (![10, 11].includes(digitos.length)) {
        mostrarAlertaCampanha("Informe um telefone com DDD, com 10 ou 11 dígitos.", "warning");
        return;
    }

    const botao = document.getElementById("btnCadastrarClienteCampanha");
    botao.disabled = true;
    try {
        const resposta = await fetch("/api/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: nome, company_name, telefone })
        });
        const dados = await resposta.json();
        if (!resposta.ok) throw new Error(dados.error || "Não foi possível cadastrar o contato.");

        const respostaClientes = await fetch("/api/users");
        clientesCampanhaCache = await respostaClientes.json();
        const novo = clientesCampanhaCache.find(cliente =>
            String(cliente.jid || "").replace(/\D/g, "").endsWith(digitos)
        );
        if (novo) clientesSelecionados.add(novo.id);

        document.getElementById("formNovoClienteCampanha").classList.add("d-none");
        document.getElementById("novoClienteNomeCampanha").value = "";
        document.getElementById("novoClienteEmpresaCampanha").value = "";
        document.getElementById("novoClienteTelefoneCampanha").value = "";
        renderizarClientesCampanha(clientesCampanhaCache);
        mostrarAlertaCampanha("Contato cadastrado e selecionado.");
    } catch (erro) {
        mostrarAlertaCampanha(erro.message, "danger");
    } finally {
        botao.disabled = false;
    }
}

function selecionarTodosDestinatarios(evento) {
    const selecionar = evento.target.checked;

    clientesCampanhaCache.forEach(cliente => {
        if (selecionar) {
            clientesSelecionados.add(cliente.id);
        } else {
            clientesSelecionados.delete(cliente.id);
        }
    });

    pesquisarDestinatarios();
    atualizarTotalSelecionados();
}

async function salvarDestinatarios() {
    if (!campanhaSelecionando) return;

    const botao = document.getElementById(
        "btnSalvarDestinatarios"
    );

    botao.disabled = true;
    botao.textContent = "Salvando...";

    try {
        const resposta = await fetch(
            `/api/campaigns/${campanhaSelecionando}/recipients`,
            {
                method: "PUT",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    clienteIds: [
                        ...clientesSelecionados
                    ]
                })
            }
        );

        const dados = await resposta.json();

        if (!resposta.ok) {
            throw new Error(
                dados.error ||
                "Erro ao salvar destinatários."
            );
        }

        modalDestinatarios.hide();

        mostrarAlertaCampanha(
            `${dados.total} destinatários salvos.`
        );

        await carregarCampanhas();
    } catch (erro) {
        console.error(erro);

        mostrarAlertaCampanha(
            erro.message,
            "danger"
        );
    } finally {
        botao.disabled = false;
        botao.textContent = "Salvar seleção";
    }
}

async function inicializarCampanhas() {
    const elementoModal =
        document.getElementById("modalCampanha");

    if (!elementoModal) return;

    modalCampanha = new bootstrap.Modal(
        elementoModal
    );

    const elementoDestinatarios =
        document.getElementById("modalDestinatarios");

    modalDestinatarios = new bootstrap.Modal(
        elementoDestinatarios
    );

    const elementoValidacao = document.getElementById("modalValidacaoCampanha");
    modalValidacaoCampanha = new bootstrap.Modal(elementoValidacao);

    const elementoDetalhes = document.getElementById("modalDetalhesCampanha");
    modalDetalhesCampanha = new bootstrap.Modal(elementoDetalhes);
    elementoDetalhes.addEventListener("hidden.bs.modal", () => clearInterval(monitorDetalhesCampanha));

    document.getElementById("btnMostrarNovoClienteCampanha")?.addEventListener("click", () => {
        document.getElementById("formNovoClienteCampanha")?.classList.toggle("d-none");
    });
    document.getElementById("btnCadastrarClienteCampanha")?.addEventListener("click", cadastrarClienteNaCampanha);

    document
        .getElementById("btnEditarCampanhaDetalhes")
        ?.addEventListener("click", editarCampanhaPelosDetalhes);

    document.getElementById("btnContatosCampanhaDetalhes")?.addEventListener("click", () => {
        if (!campanhaDetalhesAtual) return;
        modalDetalhesCampanha.hide();
        abrirDestinatarios(campanhaDetalhesAtual.id);
    });

    document
        .getElementById("btnIniciarCampanhaDetalhes")
        ?.addEventListener("click", iniciarCampanhaPelosDetalhes);

    document
        .getElementById("btnCancelarCampanhaDetalhes")
        ?.addEventListener("click", cancelarCampanhaPelosDetalhes);

    document
        .getElementById("btnNovaCampanha")
        ?.addEventListener(
            "click",
            abrirNovaCampanha
        );

    document
        .getElementById("btnSalvarCampanha")
        ?.addEventListener(
            "click",
            salvarCampanha
        );

    document
        .getElementById("pesquisaDestinatarios")
        ?.addEventListener(
            "input",
            pesquisarDestinatarios
        );

    document
        .getElementById(
            "selecionarTodosDestinatarios"
        )
        ?.addEventListener(
            "change",
            selecionarTodosDestinatarios
        );

    document
        .getElementById("btnSalvarDestinatarios")
        ?.addEventListener(
            "click",
            salvarDestinatarios
        );

    document
        .getElementById("btnContinuarCampanhaValidada")
        ?.addEventListener("click", continuarCampanhaValidada);

    document
        .querySelectorAll("[data-filtro-validacao]")
        .forEach(botao => {
            botao.addEventListener("click", () => {
                filtroValidacaoAtual = botao.dataset.filtroValidacao;
                document.querySelectorAll("[data-filtro-validacao]").forEach(item => {
                    item.classList.toggle("active", item === botao);
                });
                renderizarResultadoValidacao();
            });
        });
        
    document
        .getElementById("pesquisaCampanha")
        ?.addEventListener("input", filtrarCampanhas);

    await carregarTemplatesCampanha();
    await carregarCampanhas();
}
