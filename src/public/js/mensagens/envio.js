let clientesEnvio = [];
let templatesEnvio = [];

function atualizarPreviewEnvio() {
    const clienteId = document.getElementById("clienteSelect")?.value;
    const templateId = document.getElementById("templateSelect")?.value;
    const preview = document.getElementById("previewMensagem");
    const botao = document.getElementById("btnEnviar");

    const cliente = clientesEnvio.find(item => String(item.id) === clienteId);
    const template = templatesEnvio.find(item => String(item.id) === templateId);

    if (preview) {
        preview.value = template
            ? template.mensagem.replaceAll("{nome}", cliente?.name || "Cliente")
            : "";
    }

    if (botao) {
        botao.disabled = !cliente || !template;
    }
}

function mostrarResultadoEnvio(mensagem, tipo) {
    const alerta = document.getElementById("alertaEnvio");
    if (!alerta) return;

    alerta.className = `alert alert-${tipo}`;
    alerta.textContent = mensagem;
}

async function enviarMensagemIndividual() {
    const clienteId = document.getElementById("clienteSelect")?.value;
    const templateId = document.getElementById("templateSelect")?.value;
    const botao = document.getElementById("btnEnviar");

    if (!clienteId || !templateId) return;

    botao.disabled = true;
    botao.textContent = "Enviando...";

    try {
        const resposta = await fetch(`/api/messages/send/${clienteId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ templateId: Number(templateId) })
        });

        const dados = await resposta.json();

        if (!resposta.ok) {
            throw new Error(dados.error || "Não foi possível enviar a mensagem.");
        }

        mostrarResultadoEnvio("Mensagem enviada e registrada no histórico.", "success");
        await carregarDashboard();
    } catch (erro) {
        mostrarResultadoEnvio(erro.message, "danger");
    } finally {
        botao.textContent = "Enviar mensagem";
        atualizarPreviewEnvio();
    }
}

async function carregarEnvio() {
    const clienteSelect = document.getElementById("clienteSelect");
    const templateSelect = document.getElementById("templateSelect");

    try {
        const [respostaClientes, respostaTemplates] = await Promise.all([
            fetch("/api/users"),
            fetch("/api/messages/templates")
        ]);

        if (!respostaClientes.ok || !respostaTemplates.ok) {
            throw new Error("Não foi possível carregar clientes e templates.");
        }

        clientesEnvio = await respostaClientes.json();
        templatesEnvio = (await respostaTemplates.json()).filter(item => item.ativo);

        clienteSelect.innerHTML = '<option value="">Selecione um cliente</option>';
        templateSelect.innerHTML = '<option value="">Selecione um template</option>';

        clientesEnvio.forEach(cliente => {
            const opcao = document.createElement("option");
            opcao.value = cliente.id;
            opcao.textContent = `${cliente.name || "Sem nome"} — ${cliente.company_name || "Sem empresa"}`;
            clienteSelect.appendChild(opcao);
        });

        templatesEnvio.forEach(template => {
            const opcao = document.createElement("option");
            opcao.value = template.id;
            opcao.textContent = template.nome;
            templateSelect.appendChild(opcao);
        });

        clienteSelect.addEventListener("change", atualizarPreviewEnvio);
        templateSelect.addEventListener("change", atualizarPreviewEnvio);
        document.getElementById("btnEnviar")
            ?.addEventListener("click", enviarMensagemIndividual);

        atualizarPreviewEnvio();
    } catch (erro) {
        mostrarResultadoEnvio(erro.message, "danger");
    }
}
