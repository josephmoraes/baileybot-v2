function formatarBytes(bytes) {
    if (!bytes) return "0 KB";
    const unidades = ["B", "KB", "MB", "GB"];
    const indice = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), unidades.length - 1);
    return `${(bytes / (1024 ** indice)).toFixed(indice ? 1 : 0)} ${unidades[indice]}`;
}

async function carregarConfiguracoes() {
    const resposta = await fetch("/api/settings");
    if (!resposta.ok) throw new Error("Não foi possível carregar as configurações.");
    const dados = await resposta.json();
    document.getElementById("configPorta").textContent = dados.porta;
    document.getElementById("configAmbiente").textContent = dados.ambiente;
    document.getElementById("configNomeVendedor").value = dados.nomeVendedor;
    document.getElementById("configIntervaloMinimo").value = dados.intervaloMinimoMs / 1000;
    document.getElementById("configIntervaloMaximo").value = dados.intervaloMaximoMs / 1000;
    document.getElementById("configHorarioInicio").value = dados.horarioInicio;
    document.getElementById("configHorarioFim").value = dados.horarioFim;
    document.getElementById("configLimiteDiario").value = dados.limiteDiario;
    document.getElementById("configNotificarConclusao").checked = dados.notificarConclusao;
    document.getElementById("configBanco").textContent = dados.banco;
    document.getElementById("configTamanho").textContent = formatarBytes(dados.tamanhoBanco);
}

function mostrarAlertaConfiguracoes(mensagem, tipo = "success") {
    const alerta = document.getElementById("alertaConfiguracoes");
    alerta.className = `alert alert-${tipo}`;
    alerta.textContent = mensagem;
}

async function salvarConfiguracoesBot() {
    const botao = document.getElementById("btnSalvarConfiguracoesBot");
    botao.disabled = true;
    try {
        const resposta = await fetch("/api/settings/bot", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                nomeVendedor: document.getElementById("configNomeVendedor").value,
                intervaloMinimoSegundos: Number(document.getElementById("configIntervaloMinimo").value),
                intervaloMaximoSegundos: Number(document.getElementById("configIntervaloMaximo").value),
                horarioInicio: document.getElementById("configHorarioInicio").value,
                horarioFim: document.getElementById("configHorarioFim").value,
                limiteDiario: Number(document.getElementById("configLimiteDiario").value),
                notificarConclusao: document.getElementById("configNotificarConclusao").checked
            })
        });
        const dados = await resposta.json();
        if (!resposta.ok) throw new Error(dados.error || "Não foi possível salvar.");
        document.getElementById("configNomeVendedor").value = dados.nomeVendedor;
        document.getElementById("configIntervaloMinimo").value = dados.intervaloMinimoMs / 1000;
        document.getElementById("configIntervaloMaximo").value = dados.intervaloMaximoMs / 1000;
        if (dados.notificarConclusao && "Notification" in window && Notification.permission === "default") {
            await Notification.requestPermission();
        }
        mostrarAlertaConfiguracoes("Configurações do bot salvas.");
    } catch (erro) {
        mostrarAlertaConfiguracoes(erro.message, "danger");
    } finally {
        botao.disabled = false;
    }
}

function telefoneBloqueado(jid) {
    return String(jid || "").replace("@s.whatsapp.net", "").replace(/^55/, "");
}

async function carregarBloqueados() {
    const resposta = await fetch("/api/settings/blocked");
    if (!resposta.ok) throw new Error("Não foi possível carregar a lista de bloqueio.");
    const itens = await resposta.json();
    const tabela = document.getElementById("tabelaBloqueados");
    tabela.innerHTML = "";
    if (!itens.length) {
        tabela.innerHTML = '<tr><td colspan="4" class="text-center text-secondary">Nenhum contato bloqueado.</td></tr>';
        return;
    }
    itens.forEach(item => {
        const linha = document.createElement("tr");
        [telefoneBloqueado(item.jid), item.reason || "—", new Date(`${item.created_at}Z`).toLocaleString("pt-BR")]
            .forEach(valor => { const td = document.createElement("td"); td.textContent = valor; linha.appendChild(td); });
        const acoes = document.createElement("td");
        const botao = document.createElement("button");
        botao.className = "btn btn-sm btn-outline-success";
        botao.textContent = "Desbloquear";
        botao.addEventListener("click", async () => {
            await fetch(`/api/settings/blocked/${item.id}`, { method: "DELETE" });
            await carregarBloqueados();
        });
        acoes.appendChild(botao); linha.appendChild(acoes); tabela.appendChild(linha);
    });
}

async function adicionarBloqueio() {
    const resposta = await fetch("/api/settings/blocked", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telefone: document.getElementById("bloqueioTelefone").value, motivo: document.getElementById("bloqueioMotivo").value })
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.error || "Não foi possível bloquear.");
    document.getElementById("bloqueioTelefone").value = "";
    document.getElementById("bloqueioMotivo").value = "";
    await carregarBloqueados();
    mostrarAlertaConfiguracoes("Contato adicionado à lista de bloqueio.");
}

async function baixarBackup() {
    const botao = document.getElementById("btnBackupBanco");
    botao.disabled = true;
    botao.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Criando backup...';
    try {
        const resposta = await fetch("/api/settings/backup", { method: "POST" });
        if (!resposta.ok) throw new Error("Não foi possível criar o backup.");
        const blob = await resposta.blob();
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `baileybot-backup-${new Date().toISOString().slice(0, 10)}.db`;
        link.click();
        URL.revokeObjectURL(link.href);
    } catch (erro) {
        const alerta = document.getElementById("alertaConfiguracoes");
        alerta.className = "alert alert-danger";
        alerta.textContent = erro.message;
    } finally {
        botao.disabled = false;
        botao.innerHTML = '<i class="bi bi-download me-1"></i> Baixar backup agora';
    }
}

async function inicializarConfiguracoes() {
    try {
        await carregarConfiguracoes();
        await carregarBloqueados();
    } catch (erro) {
        const alerta = document.getElementById("alertaConfiguracoes");
        alerta.className = "alert alert-danger";
        alerta.textContent = erro.message;
    }
    document.getElementById("btnBackupBanco")?.addEventListener("click", baixarBackup);
    document.getElementById("btnSalvarConfiguracoesBot")?.addEventListener("click", salvarConfiguracoesBot);
    document.getElementById("btnAdicionarBloqueio")?.addEventListener("click", () => adicionarBloqueio().catch(erro => mostrarAlertaConfiguracoes(erro.message, "danger")));
}
