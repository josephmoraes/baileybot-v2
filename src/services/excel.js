import XLSX from "xlsx";
import userService from "./userService.js";
import fileImportService from "./fileImportService.js";
import { cleanCustomerName } from "../utils/customerName.js";

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
    async importar(base64, filename = "clientes.xlsx") {
        const linhas = await fileImportService.extrairLinhas({ base64, filename });

        const resultado = { total: linhas.length, importados: 0, duplicados: 0, invalidos: 0, erros: [] };
        linhas.forEach((linha, indice) => {
            const dados = {
                customer_code: obter(linha, ["codigo", "codigo cliente", "cod cliente", "codigo og1", "cliente codigo", "customer_code"]),
                company_name: obter(linha, ["empresa", "razao social", "company_name"]),
                name: cleanCustomerName(obter(linha, ["nome", "contato", "name"])),
                telefone: obter(linha, ["telefone", "celular", "whatsapp", "fone", "jid"])
            };
            try {
                if (!dados.customer_code) throw new Error("Código do cliente é obrigatório.");
                if (userService.buscarPorCodigo(dados.customer_code)) {
                    resultado.duplicados += 1;
                    return;
                }
                userService.criar(dados);
                resultado.importados += 1;
            } catch (erro) {
                if (erro.message.includes("já está cadastrado")) resultado.duplicados += 1;
                else {
                    resultado.invalidos += 1;
                    if (resultado.erros.length < 10) resultado.erros.push(`Linha ${indice + 2}: ${erro.message}`);
                }
            }
        });
        return resultado;
    }

    exportar() {
        const linhas = userService.listar().map(cliente => ({
            Código: cliente.customer_code || "",
            Empresa: cliente.company_name || "",
            Nome: cliente.name || "",
            Telefone: cliente.jid.replace("@s.whatsapp.net", "")
        }));
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(linhas), "Clientes");
        return XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
    }
}

export default new ExcelService();
