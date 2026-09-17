import XLSX from "xlsx";
import userService from "./userService.js";
import fileImportService from "./fileImportService.js";
import { cleanCustomerName } from "../utils/customerName.js";
import importHistoryService from "./importHistoryService.js";

function normalizarChave(valor) {
    return String(valor ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}

function obter(linha, nomes) {
    const mapa = Object.fromEntries(
        Object.entries(linha).map(([chave, valor]) => [normalizarChave(chave), valor])
    );
    for (const nome of nomes) {
        const valor = mapa[normalizarChave(nome)];
        if (valor !== undefined && valor !== null && String(valor).trim()) return String(valor).trim();
    }
    return "";
}

class ExcelService {
    async importar(base64, filename = "clientes.xlsx", importedBy = "Administrador local") {
        const linhas = await fileImportService.extrairLinhas({ base64, filename });

        const historyId = importHistoryService.iniciar({ module: "clientes", filename, importedBy, totalRows: linhas.length });
        const resultado = { total: linhas.length, importados: 0, atualizados: 0, duplicados: 0, invalidos: 0, erros: [], historyId };
        linhas.forEach((linha, indice) => {
            const dados = {
                customer_code: obter(linha, ["codigo", "codigo cliente", "cod cliente", "codigo og1", "cliente codigo", "customer_code"]),
                company_name: obter(linha, ["empresa", "razao social", "company_name"]),
                name: cleanCustomerName(obter(linha, ["nome", "contato", "name"])),
                telefone: obter(linha, ["telefone", "celular", "whatsapp", "fone", "jid"])
            };
            try {
                if (!dados.customer_code) throw new Error("Código do cliente é obrigatório.");
                const existente = userService.buscarPorCodigo(dados.customer_code);
                const salvo = userService.criar(dados);
                if (existente || salvo.updated) resultado.atualizados += 1;
                else resultado.importados += 1;
            } catch (erro) {
                if (erro.message.includes("já está cadastrado")) resultado.duplicados += 1;
                else {
                    resultado.invalidos += 1;
                    if (resultado.erros.length < 10) resultado.erros.push(`Linha ${indice + 2}: ${erro.message}`);
                    importHistoryService.erro(historyId, { rowNumber: indice + 2, customerCode: dados.customer_code,
                        error: erro.message, rawData: linha });
                }
            }
        });
        resultado.history = importHistoryService.concluir(historyId, {
            totalRows: resultado.total, importedRows: resultado.importados + resultado.atualizados,
            ignoredRows: resultado.invalidos + resultado.duplicados, duplicateRows: resultado.duplicados,
            createdCustomers: resultado.importados, updatedCustomers: resultado.atualizados, errorRows: resultado.invalidos
        });
        return resultado;
    }

    exportar() {
        const linhas = userService.listar().map(cliente => ({
            Código: cliente.customer_code || "",
            Empresa: cliente.company_name || "",
            Nome: cliente.name || "",
            Telefone: cliente.jid ? cliente.jid.replace("@s.whatsapp.net", "") : ""
        }));
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(linhas), "Clientes");
        return XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
    }
}

export default new ExcelService();
