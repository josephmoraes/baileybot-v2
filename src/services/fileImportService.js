import path from "node:path";
import XLSX from "xlsx";
import { PDFParse } from "pdf-parse";

const extensao = nome => path.extname(String(nome || "")).toLowerCase();

export function periodoDoTexto(valor) {
    const texto = String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const match = texto.match(/PERIODO\s*:?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*(?:A|ATE|-)\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
    if (!match) return null;
    const iso = (dia, mes, ano) => `${ano}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}`;
    const start = iso(match[1], match[2], match[3]);
    const end = iso(match[4], match[5], match[6]);
    if (start > end) return null;
    return { start, end };
}

export function tabelaParaObjetos(tabela) {
    const linhas = tabela.filter(linha => Array.isArray(linha) && linha.some(celula => String(celula ?? "").trim()));
    if (linhas.length < 2) return [];
    const cabecalhos = linhas[0].map((valor, indice) => String(valor ?? "").trim() || `coluna_${indice + 1}`);
    return linhas.slice(1)
        .map(linha => Object.fromEntries(cabecalhos.map((cabecalho, indice) => [cabecalho, String(linha[indice] ?? "").trim()])))
        .filter(linha => Object.values(linha).some(Boolean));
}

function textoParaObjetos(texto) {
    const linhas = String(texto || "").split(/\r?\n/).map(linha => linha.trim()).filter(Boolean);
    const tabela = linhas.map(linha => linha.split(/\s{2,}|\t|\s*;\s*|\s*\|\s*/).map(celula => celula.trim()));
    const largura = Math.max(...tabela.map(linha => linha.length), 0);
    if (largura < 2) return [];
    return tabelaParaObjetos(tabela.filter(linha => linha.length === largura));
}

export function relatorioComissionadosParaObjetos(texto) {
    const linhas = String(texto || "").split(/\r?\n/);
    let vendedor = "";
    for (const linha of linhas) {
        const celulas = linha.split("\t").map(celula => celula.trim()).filter(Boolean);
        if (!celulas.some(celula => /^VENDEDOR:/i.test(celula))) continue;
        vendedor = celulas.find(celula => !/^VENDEDOR:/i.test(celula) && celula !== "-" && !/^\d+$/.test(celula)) || "";
    }

    return linhas.flatMap(linha => {
        const celulas = linha.split("\t").map(celula => celula.trim()).filter(Boolean);
        if (!/^\d{2}\/\d{2}\/\d{4}$/.test(celulas[0] || "") || !/^[\d.]+,\d{2}$/.test(celulas[1] || "")) return [];

        let codigo = "";
        let nome = "";
        let documento = "";
        let cliente = "";
        if (celulas.length >= 6 && /^\d{4,}$/.test(celulas[2]) && /^\d{5,}$/.test(celulas[3])) {
            codigo = celulas[2];
            documento = celulas[3];
            nome = celulas[4];
            cliente = celulas.slice(5).join(" ");
        } else {
            const indiceDocumento = celulas.slice(2).findIndex(celula => /^\d{5,}$/.test(celula));
            if (indiceDocumento < 0) return [];
            documento = celulas[indiceDocumento + 2];
            cliente = celulas.at(-1) === documento ? "" : celulas.at(-1);
        }

        return [{
            "Código Cliente Comissionado": codigo,
            "Nome Cliente Comissionado": nome,
            "Número Documento": documento,
            "Valor": celulas[1],
            "Data Venda": celulas[0],
            "Cliente da Venda": cliente,
            "Vendedor do Relatório": vendedor
        }];
    });
}

export function relatorioClientesParaObjetos(texto) {
    const conteudo = String(texto || "");
    if (!/PRE[CÇ]O\s+M[EÉ]DIO/i.test(conteudo) || !/QUANTIDADE/i.test(conteudo) || !/C[ÓO]DIGO/i.test(conteudo)) return [];
    const ignorar = /^(pos\.|cliente|clientes|relat[oó]rio|ranking|c[oó]digo|valor|quantidade|pre[cç]o|m[eé]dio|total|per[ií]odo|refricom|p[aá]gina|vendas)/i;
    let vendedor = "Não informado";
    const resultado = [];
    for (const linhaOriginal of conteudo.split(/\r?\n/)) {
        const linha = linhaOriginal.replace(/\s+/g, " ").trim();
        if (!linha) continue;
        const visual = linha.match(/^\d+\s+([\w.-]+)(?:\s+(.*?))?\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})$/);
        const extraido = linha.match(/^([\d.]+,\d{2})(?:\s+(.*?))?\s+([\d.]+,\d{2})\s+\d+\s+([\d.]+,\d{2})\s+(\d+\.\d+)$/);
        const match = visual || (extraido ? [extraido[0], extraido[5], extraido[2], extraido[1], extraido[3], extraido[4]] : null);
        if (match) {
            resultado.push({
                Código: match[1],
                Nome: (match[2] || "").trim(),
                Valor: match[3],
                Quantidade: match[4],
                "Preço Médio": match[5],
                Vendedor: vendedor
            });
            continue;
        }
        if (/^[A-ZÀ-Ú][A-ZÀ-Ú\s.'-]{2,45}$/.test(linha) && !ignorar.test(linha) && !/VENDEDOR/i.test(linha)) vendedor = linha;
    }
    return resultado;
}

async function extrairPdf(buffer) {
    const parser = new PDFParse({ data: buffer });
    try {
        const resultadoTexto = await parser.getText();
        const clientes = relatorioClientesParaObjetos(resultadoTexto.text);
        if (clientes.length) return clientes;
        const resultadoTabelas = await parser.getTable();
        const tabelas = resultadoTabelas.pages.flatMap(pagina => pagina.tables || []);
        const linhas = tabelas.flatMap(tabelaParaObjetos);
        if (linhas.length) return linhas;
        const comissionados = relatorioComissionadosParaObjetos(resultadoTexto.text);
        if (comissionados.length) return comissionados;
        return textoParaObjetos(resultadoTexto.text);
    } finally {
        await parser.destroy();
    }
}

class FileImportService {
    async extrairPeriodo({ base64, filename }) {
        if (!base64) throw new Error("Selecione um arquivo para importar.");
        const buffer = Buffer.from(base64, "base64");
        if (extensao(filename) === ".pdf") {
            const parser = new PDFParse({ data: buffer });
            try { return periodoDoTexto((await parser.getText()).text); }
            finally { await parser.destroy(); }
        }
        const workbook = XLSX.read(buffer, { type: "buffer", raw: false });
        const conteudo = workbook.SheetNames.map(nome => XLSX.utils.sheet_to_csv(workbook.Sheets[nome])).join("\n");
        return periodoDoTexto(conteudo);
    }

    async extrairTabelas({ base64, filename }) {
        if (!base64) throw new Error("Selecione um arquivo para importar.");
        const tipo = extensao(filename);
        if (![".xlsx", ".xls", ".csv", ".pdf"].includes(tipo)) throw new Error("Formato não suportado. Use PDF, XLSX, XLS ou CSV.");
        const buffer = Buffer.from(base64, "base64");
        if (buffer.length > 10 * 1024 * 1024) throw new Error("O arquivo deve ter no máximo 10 MB.");
        if (tipo === ".pdf") {
            const linhas = await extrairPdf(buffer);
            if (!linhas.length) throw new Error("Não foi possível localizar uma tabela no PDF. Use um PDF com texto selecionável ou uma planilha.");
            const cabecalhos = Object.keys(linhas[0] || {});
            return [{ nome: "PDF", tabela: [cabecalhos, ...linhas.map(linha => cabecalhos.map(cabecalho => linha[cabecalho] ?? ""))] }];
        }
        const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
        return workbook.SheetNames.map(nome => ({
            nome,
            tabela: XLSX.utils.sheet_to_json(workbook.Sheets[nome], { header: 1, defval: "", raw: true })
        })).filter(planilha => planilha.tabela.some(linha => linha.some(celula => String(celula ?? "").trim())));
    }

    async extrairLinhas({ base64, filename }) {
        if (!base64) throw new Error("Selecione um arquivo para importar.");
        const tipo = extensao(filename);
        if (![".xlsx", ".xls", ".csv", ".pdf"].includes(tipo)) throw new Error("Formato não suportado. Use PDF, XLSX, XLS ou CSV.");
        const buffer = Buffer.from(base64, "base64");
        if (buffer.length > 10 * 1024 * 1024) throw new Error("O arquivo deve ter no máximo 10 MB.");
        if (tipo === ".pdf") {
            const linhas = await extrairPdf(buffer);
            if (!linhas.length) throw new Error("Não foi possível localizar uma tabela no PDF. Use um PDF com texto selecionável ou uma planilha.");
            return linhas;
        }
        const workbook = XLSX.read(buffer, { type: "buffer" });
        const planilha = workbook.Sheets[workbook.SheetNames[0]];
        const linhas = XLSX.utils.sheet_to_json(planilha, { defval: "" });
        if (!linhas.length) throw new Error("O arquivo está vazio.");
        return linhas;
    }
}

export default new FileImportService();
