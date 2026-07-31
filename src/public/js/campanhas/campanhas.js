let campanhasCache = [];
let campanhaEditando = null;
let modalCampanha = null;

let modalDestinatarios = null;
let campanhaSelecionando = null;
let clientesCampanhaCache = [];
let clientesSelecionados = new Set();

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

        linha.appendChild(
            criarCelulaCampanha(campanha.nome)
        );

        linha.appendChild(
            criarCelulaCampanha(campanha.template_nome)
        );

        const celulaStatus = document.createElement("td");
        const status = document.createElement("span");

        status.className = campanha.status === "rascunho"
            ? "badge bg-secondary"
            : "badge bg-primary";

        status.textContent = campanha.status;

        celulaStatus.appendChild(status);
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
        const btnClientes = document.createElement("button");

        btnClientes.type = "button";
        btnClientes.className =
            "btn btn-sm btn-primary me-2";

        btnClientes.title = "Selecionar clientes";

        btnClientes.innerHTML =
            '<i class="bi bi-people"></i>';

        btnClientes.addEventListener("click", () => {
            abrirDestinatarios(campanha.id);
        });

        const btnEditar = document.createElement("button");

        btnEditar.type = "button";
        btnEditar.className =
            "btn btn-sm btn-warning me-2";

        btnEditar.innerHTML =
            '<i class="bi bi-pencil"></i>';

        btnEditar.addEventListener("click", () => {
            editarCampanha(campanha.id);
        });

        const btnExcluir = document.createElement("button");

        btnExcluir.type = "button";
        btnExcluir.className =
            "btn btn-sm btn-danger";

        btnExcluir.innerHTML =
            '<i class="bi bi-trash"></i>';

        btnExcluir.addEventListener("click", () => {
            excluirCampanha(campanha.id);
        });

        celulaAcoes.appendChild(btnClientes);
        celulaAcoes.appendChild(btnEditar);
        celulaAcoes.appendChild(btnExcluir);
        linha.appendChild(celulaAcoes);

        tabela.appendChild(linha);
    });
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

        renderizarCampanhas(campanhasCache);
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
            telefone
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
        
    await carregarTemplatesCampanha();
    await carregarCampanhas();
}