import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const pastaTeste = fs.mkdtempSync(path.join(os.tmpdir(), "baileybot-test-"));
process.env.DB_PATH = path.join(pastaTeste, "test.db");
process.env.AUTH_PATH = path.join(pastaTeste, "auth");
process.env.CAMPAIGN_DELAY_MIN_MS = "0";
process.env.CAMPAIGN_DELAY_MAX_MS = "0";

const { initDatabase } = await import("../src/database/schema.js");
const { default: db } = await import("../src/database/database.js");
const { default: userService } = await import("../src/services/userService.js");
const { default: messageService } = await import("../src/services/messageService.js");
const { default: campaignService } = await import("../src/services/campaignService.js");
const { default: whatsappService } = await import("../src/services/whatsappService.js");
const { default: excelService } = await import("../src/services/excel.js");
const { default: XLSX } = await import("xlsx");
const { default: commissionService } = await import("../src/services/commissionService.js");
const { default: commissionNotificationService } = await import("../src/services/commissionNotificationService.js");
const { default: commissionPdfService } = await import("../src/services/commissionPdfService.js");
const { default: creditMessageTemplateService } = await import("../src/services/creditMessageTemplateService.js");
const { default: settingsService } = await import("../src/services/settingsService.js");
const { default: dashboardRepository } = await import("../src/repositories/dashboardRepository.js");
const { tabelaParaObjetos, relatorioComissionadosParaObjetos, relatorioClientesParaObjetos } = await import("../src/services/fileImportService.js");
const { default: reactivationService } = await import("../src/services/reactivationService.js");
const { default: customerMetricsService } = await import("../src/services/customerMetricsService.js");

initDatabase();

test("valida telefone e impede duplicidade", () => {
    assert.throws(
        () => userService.criar({ name: "Inválido", telefone: "123" }),
        /telefone válido/
    );

    userService.criar({ name: "Maria", company_name: "Refricom", telefone: "11987654321" });
    assert.throws(
        () => userService.criar({ name: "Outra", telefone: "11987654321" }),
        /já está cadastrado/
    );
});

test("envia campanha, atualiza destinatário e grava histórico", async () => {
    const cliente = userService.listar()[0];
    const templateId = messageService.criarTemplate("Cobrança", "Olá {nome}", true);
    const campanha = campaignService.criar({ nome: "Campanha agosto", templateId });
    campaignService.salvarDestinatarios(campanha.id, [cliente.id]);

    const mensagens = [];
    whatsappService.getStatus = () => "connected";
    whatsappService.verificarNumero = async jid => ({ exists: true, jid });
    whatsappService.enviarMensagem = async (jid, mensagem) => mensagens.push({ jid, mensagem });

    await campaignService.validarDestinatarios(campanha.id);

    const resultado = await campaignService.enviar(campanha.id);
    assert.equal(resultado.status, "concluida");
    assert.equal(resultado.enviados, 1);
    assert.equal(mensagens[0].mensagem, "Olá Maria");
    assert.equal(campaignService.listarDestinatarios(campanha.id)[0].status, "enviado");

    const historico = messageService.listarHistorico({ pagina: 1, porPagina: 5, pesquisa: "Maria" });
    assert.equal(historico.paginacao.total, 1);
    assert.equal(historico.itens[0].status, "enviado");
});

test("organiza participantes e envia campanha com mensagem manual", async () => {
    const cliente = userService.listar()[0];
    const campanha = campaignService.criar({ nome: "Lista especial", messageMode: "manual", customMessage: "Oferta para {nome}" });
    campaignService.adicionarDestinatarios(campanha.id, [cliente.id]);
    const participante = campaignService.listarDestinatarios(campanha.id)[0];
    assert.match(participante.last_contact_at, /^\d{4}-\d{2}-\d{2}$/);
    const acompanhamento = campaignService.atualizarAcompanhamento(campanha.id, participante.id, {
        contactStatus: "interessado",
        contactResult: "Pediu orçamento",
        contactNotes: "Retornar pela manhã",
        lastContactAt: "31/08",
        nextContactAt: "2026-09-01"
    });
    assert.equal(acompanhamento.contact_status, "interessado");
    assert.equal(acompanhamento.contact_result, "Pediu orçamento");
    assert.equal(acompanhamento.last_contact_at, `${new Date().getFullYear()}-08-31`);
    assert.equal(acompanhamento.next_contact_at, "2026-09-01");
    assert.equal(reactivationService.listar({ campaign: campanha.id }).some(item => item.id === cliente.id), true);
    whatsappService.getStatus = () => "connected";
    whatsappService.verificarNumero = async jid => ({ exists: true, jid });
    let textoEnviado = "";
    whatsappService.enviarMensagem = async (jid, mensagem) => { textoEnviado = mensagem; };
    await campaignService.validarDestinatarios(campanha.id);
    await campaignService.enviar(campanha.id);
    assert.equal(textoEnviado, "Oferta para Maria");
});

test("cria campanha sem template e exige mensagem somente no envio", async () => {
    const campanha = campaignService.criar({ nome: "Participantes sem mensagem" });
    const clienteSemTelefone = reactivationService.salvar(null, { customer_code: "SEM-FONE-1", company_name: "Cliente sem telefone" });
    const participantes = campaignService.adicionarDestinatarios(campanha.id, [clienteSemTelefone.id]);
    assert.equal(participantes.length, 1);
    assert.equal(participantes[0].cliente_jid, null);
    assert.equal(campanha.message_mode, "none");
    await assert.rejects(
        campaignService.enviar(campanha.id),
        /Defina um template ou uma mensagem manual/
    );
});

test("salva configurações do bot e substitui o vendedor", () => {
    const configuracao = settingsService.salvarBot({
        nomeVendedor: "Kalleb",
        intervaloMinimoSegundos: 2.5,
        intervaloMaximoSegundos: 5,
        horarioInicio: "00:00",
        horarioFim: "23:59",
        limiteDiario: 500,
        notificarConclusao: true
    });
    assert.equal(configuracao.nomeVendedor, "Kalleb");
    assert.equal(configuracao.intervaloMinimoMs, 2500);
    assert.equal(configuracao.intervaloMaximoMs, 5000);
    assert.equal(
        messageService.gerarMensagem({ mensagem: "Olá {nome}, aqui é {vendedor}." }, { name: "João" }),
        "Olá João, aqui é Kalleb."
    );
    assert.throws(
        () => settingsService.salvarBot({ nomeVendedor: "", intervaloMinimoSegundos: 0, intervaloMaximoSegundos: 1, horarioInicio: "00:00", horarioFim: "23:59", limiteDiario: 1 }),
        /intervalos/
    );
    const bloqueados = settingsService.bloquear("11911112222", "Sem contato");
    assert.equal(bloqueados.length, 1);
    assert.equal(settingsService.estaBloqueado("5511911112222@s.whatsapp.net"), true);
    settingsService.desbloquear(bloqueados[0].id);
    assert.equal(settingsService.listarBloqueados().length, 0);
});

test("mantém um perfil Testes isolado com crédito e percentual editáveis", () => {
    const testes = commissionService.listarTecnicos().find(item => item.is_test);
    assert.equal(testes.name, "Testes");
    commissionService.salvarTecnico({ name: "Testes", og1Code: "TESTES", commissionRate: 7.5, testAvailableCredit: 250, active: true }, testes.id);
    const atualizado = commissionService.listarTecnicos().find(item => item.id === testes.id);
    assert.equal(atualizado.commission_rate, 7.5);
    assert.equal(atualizado.liberado, 250);
    assert.equal(commissionService.salvarTecnico({ name: "Perfil protegido", og1Code: "PROTEGIDO", commissionRate: 99 }).success, true);
    const protegido = commissionService.listarTecnicos().find(item => item.og1_code === "PROTEGIDO");
    assert.equal(protegido.commission_rate, commissionService.obterTaxaPadrao());
    assert.throws(() => commissionService.definirCreditoTeste(protegido.id, 100), /somente no perfil Testes/);
});

test("altera a comissão padrão, recalcula somente créditos não resgatados e soma resgates por técnico", () => {
    commissionService.salvarTecnico({ name: "Técnico da taxa global", og1Code: "TEC-RATE" });
    const tecnico = commissionService.listarTecnicos().find(item => item.og1_code === "TEC-RATE");
    const importacao = db.prepare("INSERT INTO commission_imports(filename) VALUES(?)").run("taxa-global.xlsx").lastInsertRowid;
    const inserir = db.prepare(`INSERT INTO commissions(movement,technician_id,sale_date,sale_value,rate,commission_value,release_date,status,import_id)
        VALUES(?,?,?,?,?,?,?,?,?)`);
    const disponivel = inserir.run("RATE-OPEN", tecnico.id, "2026-08-01", 100, 3, 3, "2026-08-16", "liberada", importacao).lastInsertRowid;
    const resgatada = inserir.run("RATE-CLAIMED", tecnico.id, "2026-08-01", 200, 3, 6, "2026-08-16", "liberada", importacao).lastInsertRowid;
    const solicitacao = db.prepare(`INSERT INTO credit_requests(technician_id,amount,request_date,requester,destination,status)
        VALUES(?,?,?,?,?,?)`).run(tecnico.id, 6, "2026-08-20", "Teste", "Financeiro", "gerada").lastInsertRowid;
    db.prepare("INSERT INTO credit_request_commissions(request_id,commission_id,amount) VALUES(?,?,?)").run(solicitacao, resgatada, 6);

    const previa = commissionService.preverAlteracaoTaxaPadrao(5);
    assert.equal(previa.ignoradasResgatadas >= 1, true);
    const resultado = commissionService.alterarTaxaPadrao(5);
    assert.equal(resultado.novaTaxa, 5);
    assert.deepEqual(db.prepare("SELECT rate,commission_value FROM commissions WHERE id=?").get(disponivel), { rate: 5, commission_value: 5 });
    assert.deepEqual(db.prepare("SELECT rate,commission_value FROM commissions WHERE id=?").get(resgatada), { rate: 3, commission_value: 6 });
    assert.equal(db.prepare("SELECT commission_rate FROM technicians WHERE id=?").get(tecnico.id).commission_rate, 5);
    assert.equal(commissionService.listarTecnicos().find(item => item.id === tecnico.id).resgatado, 6);
    assert.equal(settingsService.obterBot().taxaComissaoPadrao, 5);
});

test("importa e exporta clientes em Excel", async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
        { Código: "CLI-001", Empresa: "Cliente Excel", Nome: "João", WhatsApp: "21999998888" },
        { Código: "CLI-002", Empresa: "Outro", Nome: "João", WhatsApp: "21999997777" }
    ]), "Clientes");
    const base64 = XLSX.write(workbook, { bookType: "xlsx", type: "base64" });
    const resultado = await excelService.importar(base64, "clientes.xlsx");
    assert.equal(resultado.importados, 2);
    assert.ok(userService.buscarPorCodigo("CLI-001"));
    const repetido = await excelService.importar(base64, "clientes.xlsx");
    assert.equal(repetido.duplicados, 2);
    const exportado = excelService.exportar();
    assert.ok(Buffer.isBuffer(exportado));
    assert.ok(exportado.length > 100);
});

test("importa cada documento com comissionado sem propagar dados entre linhas", async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
        { "Número Documento": "DOC-001", "Código Cliente Comissionado": "TEC-TESTE", "Nome Cliente Comissionado": "Técnico Teste", "Data Venda": "01/01/2026", Valor: "1.000,00", "Cliente da Venda": "Cliente A", "Vendedor do Relatório": "Vendedor 1", Percentual: 3 },
        { "Número Documento": "DOC-002", "Código Cliente Comissionado": "", "Nome Cliente Comissionado": "", "Data Venda": "02/01/2026", Valor: "500,00", "Cliente da Venda": "Cliente B" },
        { "Número Documento": "DOC-003", "Código Cliente Comissionado": "TEC-TESTE", "Nome Cliente Comissionado": "Técnico Teste", "Data Venda": "03/01/2026", Valor: "200,00", "Cliente da Venda": "Cliente C", "Vendedor do Relatório": "Vendedor 2", Percentual: 3 },
        { "Número Documento": "DOC-001", "Código Cliente Comissionado": "TEC-TESTE", "Nome Cliente Comissionado": "Técnico Teste", "Data Venda": "04/01/2026", Valor: "300,00" }
    ]), "Vendas");
    const base64 = XLSX.write(workbook, { bookType: "xlsx", type: "base64" });
    const previa = await commissionService.preverImportacao({ base64, filename: "vendas.xlsx" });
    assert.deepEqual(
        { total: previa.total, comComissionado: previa.comComissionado, importados: previa.importados, duplicados: previa.duplicados, invalidos: previa.invalidos },
        { total: 4, comComissionado: 3, importados: 2, duplicados: 1, invalidos: 1 }
    );
    const resultado = await commissionService.importar({
        base64,
        filename: "vendas.xlsx"
    });
    assert.equal(resultado.importados, 2);
    assert.equal(resultado.tecnicosCriados, 1);
    assert.equal(resultado.comissoes, 36);
    const vendas = db.prepare("SELECT * FROM commissions WHERE commissioned_code=? ORDER BY document_number").all("TEC-TESTE");
    assert.equal(vendas.length, 2);
    assert.deepEqual(vendas.map(venda => venda.document_number), ["DOC-001", "DOC-003"]);
    assert.equal(vendas[0].customer_name, "Cliente A");
    assert.equal(vendas[0].report_seller, "Vendedor 1");
    assert.equal(vendas[0].source_filename, "vendas.xlsx");
    assert.ok(vendas[0].imported_at);
    assert.deepEqual(vendas.map(venda => venda.release_date), ["2026-01-31", "2026-01-31"]);
    const repetido = await commissionService.preverImportacao({ base64, filename: "vendas.xlsx" });
    assert.equal(repetido.importados, 0);
    assert.equal(repetido.duplicados, 3);
    const tecnico = commissionService.listarTecnicos().find(t => t.og1_code === "TEC-TESTE");
    const credito = commissionService.creditosDisponiveis(tecnico.id)[0];
    const solicitacao = commissionService.criarSolicitacao({
        technicianId: tecnico.id,
        commissionIds: [credito.id],
        requester: "Teste automatizado"
    });
    assert.equal(solicitacao.amount, 30);
    assert.match(solicitacao.number, /^SC-/);
});

test("configura o período de fechamento e recalcula apenas comissões não resgatadas", () => {
    const vendas = db.prepare("SELECT * FROM commissions WHERE commissioned_code='TEC-TESTE' ORDER BY document_number").all();
    const preservada = vendas[0];
    const ajustavel = vendas[1];
    const solicitacao = db.prepare("SELECT id FROM credit_requests WHERE technician_id=? ORDER BY id DESC").get(preservada.technician_id);
    assert.ok(solicitacao);
    assert.equal(settingsService.obterBot().periodoFechamentoComissoes.tipo, "month_end");

    const previa = commissionService.preverAlteracaoPeriodoFechamento({ tipo: "days_after_sale", dias: 10 });
    assert.equal(previa.preservadasResgatadas >= 1, true);
    const resultado = commissionService.alterarPeriodoFechamento({ tipo: "days_after_sale", dias: 10 });
    assert.equal(resultado.novoPeriodo.dias, 10);
    assert.equal(db.prepare("SELECT release_date FROM commissions WHERE id=?").get(preservada.id).release_date, preservada.release_date);
    assert.equal(db.prepare("SELECT release_date FROM commissions WHERE id=?").get(ajustavel.id).release_date, "2026-01-13");
    assert.deepEqual(settingsService.obterBot().periodoFechamentoComissoes, { tipo: "days_after_sale", dias: 10 });

    commissionService.alterarPeriodoFechamento({ tipo: "month_end", dias: 10 });
    assert.equal(db.prepare("SELECT release_date FROM commissions WHERE id=?").get(ajustavel.id).release_date, "2026-01-31");
    assert.throws(() => commissionService.alterarPeriodoFechamento({ tipo: "days_after_sale", dias: 366 }), /entre 0 e 365 dias/);
});

test("registra migrations e consolida indicadores do dashboard", () => {
    const migrations = db.prepare("SELECT id FROM schema_migrations ORDER BY id").all();
    assert.deepEqual(migrations.map(item => item.id), ["001_compatibilidade_v2", "002_vendas_comissionadas_por_documento", "003_notificacoes_creditos_manuais", "004_modulo_reativacao", "005_clientes_sem_whatsapp", "006_ordenacao_clientes_recentes", "007_campanha_fixa_clientes_aguardando", "008_caixa_entrada_relatorios_reativacao", "009_filtro_data_cadastro_campanha_reativacao", "010_campanhas_e_ajustes_comissao", "011_acompanhamento_individual_campanhas", "012_data_inclusao_participante_campanha", "013_participante_campanha_sem_whatsapp", "014_perfil_tecnico_testes", "015_metricas_clientes_og1", "016_metricas_periodos_status_notas", "017_consultas_comissao_tecnicos", "018_pdf_solicitacoes_credito"]);
    const indicadores = dashboardRepository.obterIndicadores();
    assert.ok(indicadores.totalClientes >= 3);
    assert.ok(indicadores.totalMensagens >= 1);
    assert.ok(indicadores.totalCampanhas >= 1);
    assert.ok(indicadores.totalTecnicos >= 1);
    assert.equal(typeof indicadores.comissaoLiberada, "number");
});

test("registra técnico que perguntou sobre comissão sem alterar créditos", () => {
    const tecnico = commissionService.listarTecnicos().find(item => !item.is_test);
    const antes = db.prepare("SELECT COALESCE(SUM(commission_value),0) total FROM commissions").get().total;
    const registro = commissionService.registrarConsultaTecnico({ technicianId: tecnico.id, inquiryDate: "2026-09-04", notes: "Perguntou sobre a liberação" });
    assert.equal(registro.technician_id, tecnico.id);
    assert.equal(registro.notes, "Perguntou sobre a liberação");
    assert.equal(db.prepare("SELECT COALESCE(SUM(commission_value),0) total FROM commissions").get().total, antes);
    assert.ok(commissionService.listarConsultasTecnicos().some(item => item.id === registro.id));
    assert.equal(commissionService.excluirConsultaTecnico(registro.id).success, true);
});

test("ajusta percentual de uma venda com motivo e mantém histórico", () => {
    const venda = db.prepare("SELECT * FROM commissions WHERE document_number='DOC-003'").get();
    const ajustada = commissionService.ajustarPercentual(venda.id, { rate: 5, reason: "Bônus excepcional autorizado" });
    assert.equal(ajustada.original_rate, 3);
    assert.equal(ajustada.rate, 5);
    assert.equal(ajustada.commission_value, 10);
    assert.equal(ajustada.adjustments[0].reason, "Bônus excepcional autorizado");
    assert.throws(() => commissionService.ajustarPercentual(venda.id, { rate: 4, reason: "" }), /motivo/);
    db.prepare("DELETE FROM commission_rate_adjustments WHERE commission_id=?").run(venda.id);
    db.prepare("UPDATE commissions SET rate=?,commission_value=?,original_rate=NULL,adjustment_reason=NULL,adjusted_at=NULL,adjusted_by=NULL WHERE id=?")
        .run(venda.rate, venda.commission_value, venda.id);
    db.prepare("UPDATE commission_imports SET commission_total=36 WHERE id=?").run(venda.import_id);
});

test("importa reativação por código e preserva dados manuais ao atualizar", async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{
        "Código Cliente": "REAT-001", Cliente: "Cliente Reativação", Telefone: "21988887777", Vendedor: "LETICIA",
        "Última Movimentação": "01/01/2025", "Valor Última Movimentação": "500,00", "Valor Acumulado": "12.500,00"
    }]), "Clientes");
    const base64 = XLSX.write(workbook, { bookType: "xlsx", type: "base64" });
    const previa = await reactivationService.preverImportacao({ base64, filename: "reativacao.xlsx" });
    assert.deepEqual({ total: previa.total, novos: previa.novos, atualizacoes: previa.atualizacoes }, { total: 1, novos: 1, atualizacoes: 0 });
    assert.equal((await reactivationService.importar({ base64, filename: "reativacao.xlsx" })).novos, 1);
    const cliente = reactivationService.listar({ seller: "Letícia" }).find(item => item.customer_code === "REAT-001");
    const vip = reactivationService.listarTags().find(tag => tag.name === "VIP");
    reactivationService.salvar(cliente.id, { ...cliente, telefone: "21988887777", reactivation_status: "Aguardando", reactivation_notes: "Preservar", tag_ids: [vip.id] });
    reactivationService.registrarContato(cliente.id, { kind: "ligacao", notes: "Contato manual", next_contact_at: "2026-09-01" });
    assert.equal((await reactivationService.importar({ base64, filename: "reativacao.xlsx" })).atualizados, 1);
    const atualizado = reactivationService.obter(cliente.id);
    assert.equal(atualizado.reactivation_status, "Aguardando");
    assert.equal(atualizado.reactivation_notes, "Preservar");
    assert.equal(atualizado.tags[0].name, "VIP");
    assert.equal(atualizado.contacts[0].notes, "Contato manual");
    assert.equal(atualizado.accumulated_value, 12500);
    db.prepare("UPDATE users SET created_at='2020-01-01 00:00:00',reactivation_updated_at=NULL,reactivation_sequence=NULL WHERE id=?").run(cliente.id);
    const outro = reactivationService.salvar(null, { customer_code: "REAT-002", company_name: "Cliente mais novo", seller: "Letícia" });
    assert.equal(reactivationService.listar({ seller: "Letícia" })[0].id, outro.id);
    reactivationService.salvar(cliente.id, { ...atualizado, telefone: "21988887777", tag_ids: atualizado.tags.map(tag => tag.id) });
    assert.equal(reactivationService.listar({ seller: "Letícia" })[0].id, cliente.id);
    assert.equal(reactivationService.listar({ seller: "Letícia", sort: "accumulated", direction: "desc" })[0].accumulated_value, 12500);
    assert.equal(reactivationService.listar({ seller: "todos" }).some(item => item.id === cliente.id), true);
    assert.equal(reactivationService.listar({ seller: "todos", status: "Aguardando" }).some(item => item.id === cliente.id), true);
    assert.equal(reactivationService.listar({ seller: "todos", status: "Contatado" }).some(item => item.id === cliente.id), false);
    reactivationService.atualizarStatus(cliente.id, "Entrar em contato");
    assert.equal(reactivationService.listar({ seller: "todos", status: "Entrar em contato" }).some(item => item.id === cliente.id), true);
    assert.equal(reactivationService.listar({ seller: "todos", search: "REAT-001" }).some(item => item.id === cliente.id), true);
    assert.equal(reactivationService.listar({ seller: "todos", search: "21988887777" }).some(item => item.id === cliente.id), true);
});

test("campanha fixa inclui Aguardando e não repete código já contatado", async () => {
    db.prepare("UPDATE users SET reactivation_status='Sem Contato' WHERE customer_code IS NOT NULL").run();
    const client = reactivationService.salvar(null, {
        customer_code: "WAIT-001",
        company_name: "Cliente aguardando",
        name: "Ana",
        telefone: "21977776666",
        reactivation_status: "Aguardando"
    });
    const campaign = campaignService.ensureWaitingCampaign();
    assert.equal(campaign.fixed_key, "reactivation_waiting");
    let recipients = campaignService.listarDestinatarios(campaign.id);
    assert.deepEqual(recipients.map(item => item.customer_code), ["WAIT-001"]);
    assert.equal(recipients[0].cliente_nome, "Cliente aguardando");
    assert.throws(() => campaignService.salvarDestinatarios(campaign.id, []), /definidos automaticamente/);
    assert.throws(() => campaignService.excluir(campaign.id), /não pode ser excluída/);

    whatsappService.getStatus = () => "connected";
    whatsappService.verificarNumero = async jid => ({ exists: true, jid: `${jid}@s.whatsapp.net` });
    whatsappService.enviarMensagem = async () => ({ messageId: "waiting-campaign" });
    await campaignService.validarDestinatarios(campaign.id);
    assert.equal((await campaignService.enviar(campaign.id)).enviados, 1);
    assert.equal(reactivationService.obter(client.id).reactivation_status, "Último Contato");
    campaignService.syncWaitingRecipients(campaign.id);
    recipients = campaignService.listarDestinatarios(campaign.id);
    assert.equal(recipients.length, 0);
    assert.equal(db.prepare("SELECT COUNT(*) total FROM campaign_recipients WHERE campaign_id=? AND customer_code=? AND status='enviado'").get(campaign.id, "WAIT-001").total, 1);
    assert.equal(db.prepare("SELECT COUNT(*) total FROM reactivation_contacts WHERE user_id=? AND kind='whatsapp_campanha'").get(client.id).total, 1);
});

test("campanha de reativação combina status com Data de cadastro local", () => {
    db.prepare("UPDATE users SET reactivation_status='Sem Contato' WHERE customer_code IS NOT NULL").run();
    const ontem = new Date();
    ontem.setDate(ontem.getDate() - 1);
    const hoje = new Date();
    const dataLocal = data => `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
    const clienteOntem = reactivationService.salvar(null, { customer_code: "DATE-OLD", company_name: "Empresa Ontem", name: "Contato Ontem", telefone: "21970000001", reactivation_status: "Aguardando" });
    const clienteHoje = reactivationService.salvar(null, { customer_code: "DATE-TODAY", company_name: "Empresa Hoje", name: "Contato Hoje", telefone: "21970000002", reactivation_status: "Aguardando" });
    db.prepare("UPDATE users SET created_at=? WHERE id=?").run(`${dataLocal(ontem)} 12:00:00`, clienteOntem.id);
    db.prepare("UPDATE users SET created_at=? WHERE id=?").run(`${dataLocal(hoje)} 12:00:00`, clienteHoje.id);
    const campaign = campaignService.ensureWaitingCampaign();
    const resultado = campaignService.atualizarFiltrosReativacao(campaign.id, {
        registrationDateFrom: dataLocal(ontem),
        registrationDateTo: dataLocal(ontem)
    });
    assert.deepEqual(resultado.recipients.map(item => item.customer_code), ["DATE-OLD"]);
    assert.equal(resultado.recipients[0].cliente_nome, "Empresa Ontem");
    assert.throws(() => campaignService.atualizarFiltrosReativacao(campaign.id, { registrationDateFrom: dataLocal(hoje), registrationDateTo: dataLocal(ontem) }), /posterior/);
});

test("formulário de solicitação de crédito associa rótulos a todos os campos", () => {
    const html = fs.readFileSync(new URL("../src/public/pages/comissoes/solicitacao.html", import.meta.url), "utf8");
    for (const id of ["solTecnico", "solValor", "solData", "solResponsavel", "solDestino", "solMateriais", "solNotas"]) {
        assert.match(html, new RegExp(`<label[^>]+for=["']${id}["']`));
    }
    assert.match(html, /aria-labelledby="solCreditosLabel"/);
});

test("gera e persiste PDF válido com os dados da solicitação de crédito", async () => {
    const solicitacao = commissionService.listarSolicitacoes()[0];
    const completa = commissionService.obterSolicitacao(solicitacao.id);
    const pdf = await commissionPdfService.gerar(completa);
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
    assert.equal(pdf.length > 1000, true);
    assert.equal(commissionService.obterPdfSolicitacao(solicitacao.id), null);
    const metadados = commissionService.salvarPdfSolicitacao(solicitacao.id, pdf);
    assert.equal(metadados.filename, `${solicitacao.number}.pdf`);
    const persistido = commissionService.obterPdfSolicitacao(solicitacao.id);
    assert.equal(persistido.data.subarray(0, 5).toString(), "%PDF-");
    assert.deepEqual(persistido.data, pdf);
    assert.equal(commissionService.listarSolicitacoes()[0].pdf_available, 1);
});

test("importa relatório para conferência e só aprova com Código OG1", async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
        { "Razão Social": "EMPRESA DO RELATÓRIO LTDA", "Valor Comprado no Período": "1.250,50" },
        { "Razão Social": "OUTRA EMPRESA DO RELATÓRIO", "Valor Comprado no Período": "300,00" }
    ]), "Relatório");
    const imported = await reactivationService.importarRelatorio({
        filename: "compras-periodo.xlsx",
        base64: XLSX.write(workbook, { bookType: "xlsx", type: "base64" })
    });
    assert.equal(imported.report.total_rows, 2);
    assert.equal(imported.report.pending_rows, 2);
    const row = imported.rows[0];
    assert.throws(() => reactivationService.aprovarLinhaRelatorio(row.id, { company_name: row.company_name }), /Código OG1/);
    const tag = reactivationService.criarTag({ name: "Relatório aprovado", color: "#123456" });
    const approved = reactivationService.aprovarLinhaRelatorio(row.id, {
        customer_code: "OG1-REPORT-001",
        company_name: row.company_name,
        seller: "Clayton",
        reactivation_status: "Sem Contato",
        accumulated_value: row.purchased_value,
        tag_ids: [tag.id]
    });
    assert.equal(approved.customer_code, "OG1-REPORT-001");
    assert.equal(reactivationService.listarRelatorios()[0].approved_rows, 1);
    assert.equal(reactivationService.listar({ seller: "Clayton", tags: String(tag.id) }).some(item => item.id === approved.id), true);
    assert.equal(reactivationService.listar({ seller: "Clayton", tags: "none" }).some(item => item.id === approved.id), false);
    assert.equal(reactivationService.excluirLinhaRelatorio(imported.rows[1].id).success, true);
    assert.equal(reactivationService.listarRelatorios()[0].excluded_rows, 1);
});

test("notifica créditos manualmente, registra falha e reenvia sem duplicar", async () => {
    const technician = commissionService.listarTecnicos().find(item => item.og1_code === "TEC-TESTE");
    db.prepare("UPDATE technicians SET phone=? WHERE id=?").run("21999998888", technician.id);
    db.prepare("UPDATE app_settings SET value='0' WHERE key IN ('campaign_delay_min_ms','campaign_delay_max_ms')").run();
    const importId = db.prepare("SELECT id FROM commission_imports WHERE filename='vendas.xlsx' ORDER BY id DESC LIMIT 1").get().id;
    let shouldFail = true;
    whatsappService.getStatus = () => "connected";
    whatsappService.enviarMensagem = async (phone, message) => {
        assert.equal(phone, "21999998888");
        assert.match(message, /novos créditos/i);
        assert.match(message, /Novos créditos: 2/);
        if (shouldFail) throw new Error("Falha simulada");
        return { messageId: "test" };
    };
    const waitJob = async id => {
        for (let attempt = 0; attempt < 50; attempt += 1) {
            const job = commissionNotificationService.getJob(id);
            if (!["pendente", "processando", "cancelando"].includes(job.status)) return job;
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        throw new Error("Envio de teste não terminou.");
    };
    const first = commissionNotificationService.createImportJob(importId, "Teste", false);
    assert.equal((await waitJob(first.id)).failed, 1);
    assert.equal(commissionService.listarImportacoes()[0].notification_status, "parcialmente_notificada");
    shouldFail = false;
    const retry = commissionNotificationService.createImportJob(importId, "Teste", true);
    assert.equal((await waitJob(retry.id)).sent, 1);
    assert.equal(commissionService.listarImportacoes()[0].notification_status, "notificada");
    assert.throws(() => commissionNotificationService.createImportJob(importId, "Teste", false), /já foram notificados/);
    assert.equal(db.prepare("SELECT COUNT(*) total FROM commission_notification_recipients WHERE import_id=?").get(importId).total, 2);
    assert.deepEqual(db.prepare("SELECT status FROM commission_notification_recipients WHERE import_id=? ORDER BY id").all(importId).map(item => item.status), ["falhou", "enviado"]);
});

test("gera prévia e histórico para consulta manual de saldo", async () => {
    const technician = commissionService.listarTecnicos().find(item => item.og1_code === "TEC-TESTE");
    const preview = commissionNotificationService.previewBalance(technician.id);
    assert.equal(preview.canSend, true);
    assert.match(preview.message, /Crédito total: 36,00/);
    assert.match(preview.message, /Crédito disponível: 6,00/);
    assert.doesNotMatch(preview.message, /R\$/);
    const summary = commissionNotificationService.previewBulk([technician.id]);
    assert.deepEqual(summary, { selected: 1, withWhatsapp: 1, withoutWhatsapp: 0, inactive: 0, willSend: 1 });
    whatsappService.enviarMensagem = async (phone, message) => {
        assert.equal(phone, "21999998888");
        assert.match(message, /resumo atualizado/i);
        return { messageId: "balance-test" };
    };
    const job = commissionNotificationService.createBalanceJob([technician.id], "Teste de saldo");
    for (let attempt = 0; attempt < 50 && ["pendente", "processando"].includes(commissionNotificationService.getJob(job.id).status); attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    const history = commissionNotificationService.history().find(item => item.job_id === job.id);
    assert.equal(history.kind, "consulta_saldo");
    assert.equal(history.status, "enviado");
    assert.equal(history.initiated_by, "Teste de saldo");
});

test("exclui técnico e remove créditos, solicitações e histórico em transação", () => {
    commissionService.salvarTecnico({ name: "Técnico descartável", og1Code: "TEC-DELETE" });
    const tecnico = commissionService.listarTecnicos().find(item => item.og1_code === "TEC-DELETE");
    const importacao = db.prepare("INSERT INTO commission_imports(filename) VALUES(?)").run("delete.xlsx").lastInsertRowid;
    const comissao = db.prepare(`INSERT INTO commissions(movement,technician_id,sale_date,sale_value,rate,commission_value,release_date,status,import_id)
        VALUES(?,?,?,?,?,?,?,?,?)`).run("DELETE-001", tecnico.id, "2026-08-01", 100, 3, 3, "2026-08-08", "liberada", importacao).lastInsertRowid;
    const solicitacao = db.prepare(`INSERT INTO credit_requests(technician_id,amount,request_date,requester,destination,status)
        VALUES(?,?,?,?,?,?)`).run(tecnico.id, 3, "2026-08-09", "Teste", "Financeiro", "gerada").lastInsertRowid;
    db.prepare("INSERT INTO credit_request_commissions(request_id,commission_id,amount) VALUES(?,?,?)").run(solicitacao, comissao, 3);
    const job = db.prepare("INSERT INTO commission_notification_jobs(kind,status,initiated_by,total,processed,sent) VALUES('consulta_saldo','concluido','Teste',1,1,1)").run().lastInsertRowid;
    db.prepare(`INSERT INTO commission_notification_recipients(job_id,technician_id,technician_name,kind,message,status)
        VALUES(?,?,?,'consulta_saldo','Teste','enviado')`).run(job, tecnico.id, tecnico.name);

    const resultado = commissionService.excluirTecnico(tecnico.id);
    assert.deepEqual(resultado.removed, { commissions: 1, requests: 1, notifications: 1 });
    assert.equal(db.prepare("SELECT COUNT(*) total FROM technicians WHERE id=?").get(tecnico.id).total, 0);
    assert.equal(db.prepare("SELECT COUNT(*) total FROM commissions WHERE technician_id=?").get(tecnico.id).total, 0);
    assert.equal(db.prepare("SELECT COUNT(*) total FROM credit_requests WHERE technician_id=?").get(tecnico.id).total, 0);
    assert.equal(db.prepare("SELECT COUNT(*) total FROM commission_notification_recipients WHERE technician_id=?").get(tecnico.id).total, 0);
    assert.equal(db.prepare("SELECT COUNT(*) total FROM commission_notification_jobs WHERE id=?").get(job).total, 0);
});

test("persiste e aplica os templates editáveis de créditos", () => {
    const templates = creditMessageTemplateService.list();
    assert.deepEqual(templates.map(item => item.key), ["credito_gerado", "resumo_creditos", "credito_liberado", "movimentacao_credito"]);
    creditMessageTemplateService.update("credito_liberado", "[Nome]: [Credito] créditos liberados em [Data]. Disponível: [CreditoDisponivel].");
    assert.equal(
        creditMessageTemplateService.render("credito_liberado", { nome: "Ana", credito: 3.87, creditoDisponivel: 10, data: "2026-08-08" }),
        "Ana: 3,87 créditos liberados em 08/08/2026. Disponível: 10,00."
    );
});

test("converte tabelas extraídas de PDF em registros", () => {
    const linhas = tabelaParaObjetos([
        ["Código", "Nome", "WhatsApp"],
        ["PDF-001", "Ana PDF", "11988887777"]
    ]);
    assert.deepEqual(linhas, [{ "Código": "PDF-001", Nome: "Ana PDF", WhatsApp: "11988887777" }]);
});

test("interpreta ranking de clientes e preserva linha sem nome", () => {
    const rows = relatorioClientesParaObjetos(`CÓDIGO NOME VALOR QUANTIDADE PREÇO MÉDIO
ALISSON
1 1.06728 CLIENTE COM NOME 1.250,50 2,00 625,25
2 9.99999 300,00 3,00 100,00`);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].Vendedor, "ALISSON");
    assert.equal(rows[1].Nome, "");
    assert.equal(rows[1].Código, "9.99999");
});

test("importa métricas mensais pelo código OG1 e aceita cliente sem nome", async () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet([
        { Código: "1.06728", Nome: "CLIENTE COM NOME", Valor: "1.250,50", Quantidade: "2", "Preço Médio": "625,25", Vendedor: "Alisson" },
        { Código: "9.99999", Nome: "", Valor: "300,00", Quantidade: "3", "Preço Médio": "100,00", Vendedor: "Vendedor Externo" }
    ]);
    XLSX.utils.sheet_add_aoa(sheet, [["PERÍODO: 01/01/2025 A 31/01/2025"]], { origin: "H1" });
    XLSX.utils.book_append_sheet(workbook, sheet, "Janeiro");
    const arquivo = { filename: "clientes-janeiro-2025.xlsx", base64: XLSX.write(workbook, { bookType: "xlsx", type: "base64" }) };
    const preview = await customerMetricsService.preview(arquivo);
    assert.deepEqual(preview.period, { start: "2025-01-01", end: "2025-01-31", type: "Mensal" });
    assert.equal(preview.total, 2);
    const imported = await customerMetricsService.import(arquivo);
    assert.equal(imported.total, 2);
    const noName = db.prepare("SELECT * FROM users WHERE customer_code='9.99999'").get();
    assert.equal(noName.company_name, null);
    const metric = db.prepare("SELECT * FROM customer_monthly_metrics WHERE user_id=?").get(noName.id);
    assert.equal(metric.seller, "Outros");
    assert.equal(metric.report_seller, "Vendedor Externo");
    assert.equal(metric.average_order_value, 100);
    await assert.rejects(customerMetricsService.import(arquivo), /sobrepõe/);
    const updated = customerMetricsService.updateProducts(noName.id, { main_products: "Capacitor", latest_products: "Filtro secador" });
    assert.equal(updated.main_products, "Capacitor");
    assert.equal(updated.latest_products, "Filtro secador");
});

test("não grava telefone da coluna Contato como nome do cliente", async () => {
    assert.equal(reactivationService.mapearLinha({
        "Código Cliente": "NAME-001",
        Cliente: "Empresa correta",
        Contato: "(82) 3334-0273",
        WhatsApp: "82999998888",
        Status: "Aguardando"
    }).name, "");

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{
        Código: "NAME-002",
        Empresa: "Outra empresa correta",
        Contato: "2126-8937",
        WhatsApp: "82988887777"
    }]), "Clientes");
    const result = await excelService.importar(XLSX.write(workbook, { bookType: "xlsx", type: "base64" }), "nomes.xlsx");
    assert.equal(result.importados, 1);
    const customer = userService.listar().find(item => item.customer_code === "NAME-002");
    assert.equal(customer.name, null);
    assert.equal(customer.company_name, "Outra empresa correta");
});

test("interpreta PDF convertido do relatório de comissionados", () => {
    const linhas = relatorioComissionadosParaObjetos([
        "LETICIA\t00023\tVENDEDOR: \t-",
        "01/08/2026\t7.630,00\t278444 \tDIVERSOS",
        "03/08/2026\t742,00\t278533\tF \tKRONA TUBOS",
        "05/08/2026\t129,00\t105784 \t278701\tCRISTIANO SIMÃO \tDENVER DISTRIBUIDORA"
    ].join("\n"));
    assert.equal(linhas.length, 3);
    assert.equal(linhas[0]["Código Cliente Comissionado"], "");
    assert.equal(linhas[1]["Código Cliente Comissionado"], "");
    assert.deepEqual(linhas[2], {
        "Código Cliente Comissionado": "105784",
        "Nome Cliente Comissionado": "CRISTIANO SIMÃO",
        "Número Documento": "278701",
        Valor: "129,00",
        "Data Venda": "05/08/2026",
        "Cliente da Venda": "DENVER DISTRIBUIDORA",
        "Vendedor do Relatório": "LETICIA"
    });
});

test("exclui relatório preservando ou removendo suas comissões com proteção financeira", async () => {
    const arquivoImportacao = (filename, document) => {
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{
            "Número Documento": document,
            "Código Cliente Comissionado": "TEC-TESTE",
            "Nome Cliente Comissionado": "Técnico Teste",
            "Data Venda": "07/08/2026",
            Valor: "100,00",
            Percentual: 3
        }]), "Vendas");
        return { base64: XLSX.write(workbook, { bookType: "xlsx", type: "base64" }), filename };
    };

    await commissionService.importar(arquivoImportacao("manter-comissoes.xlsx", "DEL-MANTER-001"));
    const importacaoManter = db.prepare("SELECT id FROM commission_imports WHERE filename=?").get("manter-comissoes.xlsx");
    const impactoManter = commissionService.impactoExclusaoImportacao(importacaoManter.id);
    assert.equal(impactoManter.commissions_count, 1);
    const preservado = commissionService.excluirImportacao(importacaoManter.id, "report");
    assert.equal(preservado.preserved_commissions, 1);
    assert.equal(db.prepare("SELECT import_id FROM commissions WHERE document_number=?").get("DEL-MANTER-001").import_id, null);
    assert.equal(db.prepare("SELECT COUNT(*) total FROM commission_imports WHERE id=?").get(importacaoManter.id).total, 0);

    await commissionService.importar(arquivoImportacao("apagar-comissoes.xlsx", "DEL-APAGAR-001"));
    const importacaoApagar = db.prepare("SELECT id FROM commission_imports WHERE filename=?").get("apagar-comissoes.xlsx");
    const removido = commissionService.excluirImportacao(importacaoApagar.id, "report_and_commissions");
    assert.equal(removido.removed_commissions, 1);
    assert.equal(db.prepare("SELECT COUNT(*) total FROM commissions WHERE document_number=?").get("DEL-APAGAR-001").total, 0);

    const importacaoProtegida = db.prepare("SELECT id FROM commission_imports WHERE filename=?").get("vendas.xlsx");
    assert.ok(commissionService.impactoExclusaoImportacao(importacaoProtegida.id).linked_requests >= 1);
    assert.throws(
        () => commissionService.excluirImportacao(importacaoProtegida.id, "report_and_commissions"),
        /vinculados a uma solicitação/
    );
    assert.ok(db.prepare("SELECT id FROM commission_imports WHERE id=?").get(importacaoProtegida.id));
});

test.after(() => {
    db.close();
    fs.rmSync(pastaTeste, { recursive: true, force: true });
});
