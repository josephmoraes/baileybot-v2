const distSeguro = (valor) =>
  String(valor ?? "").replace(
    /[&<>\"]/g,
    (item) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[item],
  );
async function distJson(url, options) {
  const resposta = await fetch(url, options);
  const dados = await resposta.json();
  if (!resposta.ok)
    throw new Error(dados.error || "Não foi possível concluir a operação.");
  return dados;
}
async function distCarregarLista() {
  const vendedor = document.getElementById("distFiltroVendedor").value;
  const itens = await distJson(
    `/api/reactivation/assignments?seller=${encodeURIComponent(vendedor)}`,
  );
  document.getElementById("distLista").innerHTML = itens.length
    ? itens
        .map(
          (item) =>
            `<tr><td>${distSeguro(item.seller)}</td><td>${distSeguro(item.customer_code)}</td><td>${distSeguro(item.customer || item.customer_code)}</td><td><span class="badge bg-${item.status === "pendente" ? "warning text-dark" : "success"}">${distSeguro(item.status)}</span></td><td><button class="btn btn-sm btn-outline-light" data-dist-edit="${item.user_id}"><i class="bi bi-pencil me-1"></i>Editar</button>${item.status === "pendente" ? `<button class="btn btn-sm btn-success ms-1" data-dist-contact="${item.id}" data-client="${item.user_id}" data-seller="${distSeguro(item.seller)}">Registrar contato</button><button class="btn btn-sm btn-outline-danger ms-1" data-dist-remove="${item.id}">Remover</button>` : ""}</td></tr>`,
        )
        .join("")
    : '<tr><td colspan="5" class="text-center text-secondary py-4">Nenhum cliente distribuído.</td></tr>';
}
async function distPesquisar() {
  const busca = document.getElementById("distPesquisa").value.trim();
  const itens = await distJson(
    `/api/reactivation/assignments/candidates?search=${encodeURIComponent(busca)}`,
  );
  const classe = (prioridade) =>
    prioridade === "Alta"
      ? "danger"
      : prioridade === "Média"
        ? "warning text-dark"
        : "secondary";
  document.getElementById("distCandidatos").innerHTML = itens.length
    ? itens
        .map(
          (item) =>
            `<tr><td><input class="form-check-input" type="checkbox" value="${item.id}"></td><td><span class="badge bg-${classe(item.priority.level)}">${distSeguro(item.priority.level)}</span><small class="d-block text-secondary">Score ${item.priority.score}</small></td><td>${distSeguro(item.customer_code)}</td><td>${distSeguro(item.customer || item.customer_code)}</td><td>${distSeguro(item.last_movement_at || "—")}</td></tr>`,
        )
        .join("")
    : '<tr><td colspan="5" class="text-center text-secondary py-4">Nenhum cliente disponível.</td></tr>';
}
async function distCarregarRecomendacoes() {
  const seller = document.getElementById("distVendedor").value;
  const itens = await distJson(
    `/api/reactivation/assignments/candidates?seller=${encodeURIComponent(seller)}`,
  );
  const classe = (prioridade) =>
    prioridade === "Alta"
      ? "danger"
      : prioridade === "Média"
        ? "warning text-dark"
        : "secondary";
  document.getElementById("distRecomendacaoVendedor").textContent = seller;
  document.getElementById("distRecomendacoes").innerHTML = itens.length
    ? itens
        .map(
          (item) =>
            `<label class="d-flex align-items-center gap-2 px-2 py-1 border border-secondary rounded small"><input class="form-check-input" type="checkbox" value="${item.id}"><span>${distSeguro(item.customer || item.customer_code)} <span class="badge bg-${classe(item.priority.level)}">${distSeguro(item.priority.level)} ${item.priority.score}</span></span></label>`,
        )
        .join("")
    : '<small class="text-secondary">Nenhuma recomendação pendente para este vendedor.</small>';
}
window.inicializarDistribuicaoReativacao = async () => {
  const sellers = await distJson("/api/settings/sellers");
  const options = sellers
    .filter((nome) => nome !== "Outros")
    .map(
      (nome) =>
        `<option value="${distSeguro(nome)}">${distSeguro(nome)}</option>`,
    )
    .join("");
  document.getElementById("distVendedor").innerHTML = options;
  document
    .getElementById("distFiltroVendedor")
    .insertAdjacentHTML("beforeend", options);
  document.getElementById("distVendedor").onchange = () =>
    distCarregarRecomendacoes().catch((error) => alert(error.message));
  document
    .getElementById("distPesquisa")
    .addEventListener("change", () =>
      distPesquisar().catch((error) => alert(error.message)),
    );
  document.getElementById("distSelecionarTodos").onchange = (event) =>
    document
      .querySelectorAll("#distCandidatos input[type=checkbox]")
      .forEach((input) => {
        input.checked = event.target.checked;
      });
  document.getElementById("distDistribuir").onclick = async () => {
    const client_ids = [
      ...document.querySelectorAll(
        "#distCandidatos input:checked, #distRecomendacoes input:checked",
      ),
    ].map((input) => Number(input.value));
    const result = await distJson("/api/reactivation/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        seller: document.getElementById("distVendedor").value,
        client_ids,
      }),
    });
    alert(`${result.added} cliente(s) distribuído(s) para ${result.seller}.`);
    await Promise.all([
      distCarregarLista(),
      distCarregarRecomendacoes(),
      distPesquisar(),
    ]);
  };
  document.getElementById("distFiltroVendedor").onchange = () =>
    distCarregarLista().catch((error) => alert(error.message));
  document.getElementById("distLista").onclick = async (event) => {
    const editar = event.target.closest("[data-dist-edit]");
    if (editar) {
      await window.abrirFichaMetricas(editar.dataset.distEdit);
      return;
    }
    const remover = event.target.closest("[data-dist-remove]");
    if (remover) {
      if (window.confirm("Remover este cliente da lista de trabalho?")) {
        await distJson(
          `/api/reactivation/assignments/${remover.dataset.distRemove}`,
          { method: "DELETE" },
        );
        await Promise.all([distCarregarLista(), distCarregarRecomendacoes()]);
      }
      return;
    }
    const botao = event.target.closest("[data-dist-contact]");
    if (!botao) return;
    document.getElementById("distAssignmentId").value =
      botao.dataset.distContact;
    document.getElementById("distClientId").value = botao.dataset.client;
    document.getElementById("distContatoForm").dataset.seller =
      botao.dataset.seller;
    bootstrap.Modal.getOrCreateInstance(
      document.getElementById("distContatoModal"),
    ).show();
  };
  document.getElementById("distAgendar").onchange = (event) =>
    document
      .getElementById("distRetornoArea")
      .classList.toggle("d-none", !event.target.checked);
  document.getElementById("distContatoForm").onsubmit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const schedule_return = document.getElementById("distAgendar").checked;
    await distJson(
      `/api/reactivation/clients/${document.getElementById("distClientId").value}/contacts`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: document.getElementById("distContatoTipo").value,
          responsible: form.dataset.seller,
          resulting_status: document.getElementById("distContatoStatus").value,
          notes: document.getElementById("distContatoNotas").value,
          schedule_return,
          next_action: document.getElementById("distProximaAcao").value,
          next_contact_at: document.getElementById("distProximoContato").value,
        }),
      },
    );
    await distJson(
      `/api/reactivation/assignments/${document.getElementById("distAssignmentId").value}/complete`,
      { method: "PATCH" },
    );
    bootstrap.Modal.getInstance(
      document.getElementById("distContatoModal"),
    ).hide();
    form.reset();
    await distCarregarLista();
  };
  await Promise.all([distCarregarLista(), distCarregarRecomendacoes()]);
};
