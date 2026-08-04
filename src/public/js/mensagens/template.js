let modalTemplate;
let templateEditando = null;
let templatesCache = [];

async function carregarTemplates() {

    try {

        const resposta = await fetch("/api/messages/templates");

        const templates = await resposta.json();

        templatesCache = templates;

        const tabela = document.getElementById("tabelaTemplates");

        tabela.innerHTML = "";

        if (templates.length === 0) {

            tabela.innerHTML = `
                <tr>
                    <td colspan="3" class="text-center text-secondary py-4">
                        Nenhum template cadastrado.
                    </td>
                </tr>
            `;

            return;

        }

        templates.forEach(template => {

            tabela.innerHTML += `
                <tr>

                    <td>${template.nome}</td>

                    <td>
                        <span class="badge ${template.ativo ? "bg-success" : "bg-secondary"}">
                            ${template.ativo ? "Ativo" : "Inativo"}
                        </span>
                    </td>

                    <td>

                        <button
                            class="btn btn-sm btn-warning"
                            onclick="editarTemplate(${template.id})">

                            Editar

                        </button>

                        <button
                            class="btn btn-sm btn-danger"
                            onclick="excluirTemplate(${template.id})">

                            Excluir

                        </button>

                    </td>

                </tr>
            `;

        });

    } catch (erro) {

        console.error(erro);

    }

}

async function excluirTemplate(id) {
    const confirmar = confirm(
        "Deseja realmente excluir este template?"
    );

    if (!confirmar) return;

    try {
        const resposta = await fetch(
            `/api/messages/templates/${id}`,
            {
                method: "DELETE"
            }
        );

        const dados = await resposta.json();

        if (!resposta.ok) {
            throw new Error(
                dados.error ||
                "Não foi possível excluir o template."
            );
        }

        alert(
            dados.message ||
            "Template excluído com sucesso."
        );

        await carregarTemplates();
    } catch (erro) {
        console.error(erro);

        alert(erro.message);
    }
}

async function editarTemplate(id) {

    const template = templatesCache.find(t => t.id === id);

    if (!template) {

        alert("Template não encontrado.");
        return;

    }

    templateEditando = id;

    document.getElementById("tituloModalTemplate").textContent = "Editar Template";

    document.getElementById("nomeTemplate").value = template.nome;

    document.getElementById("mensagemTemplate").value = template.mensagem;

    document.getElementById("ativoTemplate").checked = !!template.ativo;

    modalTemplate.show();

}

function abrirModalTemplate() {

    templateEditando = null;

    document.getElementById("tituloModalTemplate").textContent = "Novo Template";

    document.getElementById("nomeTemplate").value = "";

    document.getElementById("mensagemTemplate").value = "";

    document.getElementById("ativoTemplate").checked = true;

    modalTemplate.show();

}

document.addEventListener("DOMContentLoaded", () => {

    const elemento = document.getElementById("modalTemplate");

    if (elemento) {

        modalTemplate = new bootstrap.Modal(elemento);

    }

});

function inicializarTemplates() {

    const elemento = document.getElementById("modalTemplate");

    if (elemento) {

        modalTemplate = new bootstrap.Modal(elemento);

    }

    document
        .getElementById("btnNovoTemplate")
        ?.addEventListener("click", abrirModalTemplate);

    document
        .getElementById("btnSalvarTemplate")
        ?.addEventListener("click", salvarTemplate);

}

async function salvarTemplate() {

    const nome = document.getElementById("nomeTemplate").value.trim();

    const mensagem = document.getElementById("mensagemTemplate").value.trim();

    const ativo = document.getElementById("ativoTemplate").checked;

    if (!nome || !mensagem) {

        alert("Preencha todos os campos.");

        return;

    }

    try {

        const url = templateEditando
            ? `/api/messages/templates/${templateEditando}`
            : "/api/messages/templates";

        const metodo = templateEditando
            ? "PUT"
            : "POST";

        const resposta = await fetch(url, {

            method: metodo,

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                nome,
                mensagem,
                ativo
            })

        });

        const dados = await resposta.json();

        alert(dados.message);

        modalTemplate.hide();

        carregarTemplates();

    } catch (erro) {

        console.error(erro);

        alert("Erro ao salvar template.");

    }

}