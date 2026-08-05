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
const { default: settingsService } = await import("../src/services/settingsService.js");
const { default: dashboardRepository } = await import("../src/repositories/dashboardRepository.js");
const { tabelaParaObjetos } = await import("../src/services/fileImportService.js");

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

test("processa comissão real e gera solicitação de crédito", async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
        { Movimento: "MOV-001", "Código Técnico": "TEC-TESTE", "Nome Técnico": "Técnico Teste", "Data Venda": "01/01/2026", Valor: "1.000,00", Percentual: 3 }
    ]), "Vendas");
    const resultado = await commissionService.importar({
        base64: XLSX.write(workbook, { bookType: "xlsx", type: "base64" }),
        filename: "vendas.xlsx"
    });
    assert.equal(resultado.importados, 1);
    assert.equal(resultado.tecnicosCriados, 1);
    assert.equal(resultado.comissoes, 30);
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

test("registra migrations e consolida indicadores do dashboard", () => {
    const migrations = db.prepare("SELECT id FROM schema_migrations ORDER BY id").all();
    assert.deepEqual(migrations.map(item => item.id), ["001_compatibilidade_v2"]);
    const indicadores = dashboardRepository.obterIndicadores();
    assert.ok(indicadores.totalClientes >= 3);
    assert.ok(indicadores.totalMensagens >= 1);
    assert.ok(indicadores.totalCampanhas >= 1);
    assert.ok(indicadores.totalTecnicos >= 1);
    assert.equal(typeof indicadores.comissaoLiberada, "number");
});

test("converte tabelas extraídas de PDF em registros", () => {
    const linhas = tabelaParaObjetos([
        ["Código", "Nome", "WhatsApp"],
        ["PDF-001", "Ana PDF", "11988887777"]
    ]);
    assert.deepEqual(linhas, [{ "Código": "PDF-001", Nome: "Ana PDF", WhatsApp: "11988887777" }]);
});

test.after(() => {
    db.close();
    fs.rmSync(pastaTeste, { recursive: true, force: true });
});
