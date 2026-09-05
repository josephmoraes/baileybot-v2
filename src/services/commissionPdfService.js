import PDFDocument from "pdfkit";

const moeda = valor => Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const credito = valor => Number(valor || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dataBr = valor => {
    const [ano, mes, dia] = String(valor || "").slice(0, 10).split("-");
    return ano && mes && dia ? `${dia}/${mes}/${ano}` : "-";
};

const texto = valor => String(valor ?? "").trim() || "-";

class CommissionPdfService {
    gerar(solicitacao) {
        return new Promise((resolve, reject) => {
            const doc = new PDFDocument({ size: "A4", margin: 46, bufferPages: true, info: { Title: `Solicitação ${solicitacao.number}` } });
            const partes = [];
            doc.on("data", parte => partes.push(parte));
            doc.on("end", () => resolve(Buffer.concat(partes)));
            doc.on("error", reject);

            const largura = doc.page.width - 92;
            const verde = "#198754";
            const cinza = "#5f6873";
            const linha = "#d9dee3";

            const cabecalho = () => {
                doc.fillColor(verde).font("Helvetica-Bold").fontSize(22).text("REFRICOM", 46, 42);
                doc.fillColor("#1f2933").fontSize(15).text("SOLICITAÇÃO DE CRÉDITOS", 46, 72);
                doc.fillColor(cinza).font("Helvetica").fontSize(9).text("Documento gerado pelo BaileyBot", 46, 94);
                doc.fillColor("#1f2933").font("Helvetica-Bold").fontSize(12).text(solicitacao.number, 390, 50, { width: 158, align: "right" });
                doc.fillColor(cinza).font("Helvetica").fontSize(9).text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, 350, 72, { width: 198, align: "right" });
                doc.moveTo(46, 112).lineTo(548, 112).lineWidth(1.5).strokeColor(verde).stroke();
                doc.y = 128;
            };

            const campo = (rotulo, valor, x, y, larguraCampo) => {
                doc.fillColor(cinza).font("Helvetica-Bold").fontSize(8).text(rotulo.toUpperCase(), x, y, { width: larguraCampo });
                doc.fillColor("#1f2933").font("Helvetica").fontSize(10).text(texto(valor), x, y + 13, { width: larguraCampo });
            };

            const novaPaginaSeNecessario = altura => {
                if (doc.y + altura <= doc.page.height - 58) return;
                doc.addPage();
                cabecalho();
            };

            cabecalho();
            const yDados = doc.y;
            campo("Técnico", solicitacao.technician_name, 46, yDados, 245);
            campo("Código OG1", solicitacao.og1_code, 310, yDados, 105);
            campo("Data da solicitação", dataBr(solicitacao.request_date), 430, yDados, 118);
            campo("Responsável", solicitacao.requester, 46, yDados + 46, 245);
            campo("Destino", solicitacao.destination, 310, yDados + 46, 238);
            doc.y = yDados + 92;

            doc.fillColor("#1f2933").font("Helvetica-Bold").fontSize(11).text("CRÉDITOS INCLUÍDOS", 46, doc.y);
            doc.y += 20;
            const colunas = [46, 190, 270, 365, 430];
            const larguras = [138, 74, 89, 59, 118];
            const desenharCabecalhoTabela = () => {
                const y = doc.y;
                doc.rect(46, y, largura, 22).fill("#edf6f1");
                ["Documento", "Venda", "Valor da venda", "Taxa", "Crédito"].forEach((item, indice) => {
                    doc.fillColor("#244535").font("Helvetica-Bold").fontSize(8).text(item, colunas[indice] + 4, y + 7, { width: larguras[indice] - 8, align: indice >= 2 ? "right" : "left" });
                });
                doc.y = y + 22;
            };
            desenharCabecalhoTabela();
            solicitacao.comissoes.forEach(comissao => {
                if (doc.y + 25 > doc.page.height - 58) {
                    doc.addPage();
                    cabecalho();
                    desenharCabecalhoTabela();
                }
                const y = doc.y;
                const valores = [texto(comissao.document_number || comissao.movement), dataBr(comissao.sale_date), moeda(comissao.sale_value), `${credito(comissao.rate)}%`, credito(comissao.rescued_amount)];
                valores.forEach((item, indice) => doc.fillColor("#1f2933").font("Helvetica").fontSize(8.5).text(item, colunas[indice] + 4, y + 7, { width: larguras[indice] - 8, align: indice >= 2 ? "right" : "left", ellipsis: true }));
                doc.moveTo(46, y + 24).lineTo(548, y + 24).lineWidth(0.5).strokeColor(linha).stroke();
                doc.y = y + 25;
            });

            novaPaginaSeNecessario(145);
            doc.y += 12;
            doc.fillColor("#1f2933").font("Helvetica-Bold").fontSize(12).text(`TOTAL: ${credito(solicitacao.amount)} CRÉDITOS`, 330, doc.y, { width: 218, align: "right" });
            doc.y += 32;
            campo("Materiais", solicitacao.materials, 46, doc.y, largura);
            doc.y += 42;
            campo("Observações", solicitacao.notes, 46, doc.y, largura);
            doc.y += 60;
            doc.moveTo(70, doc.y).lineTo(280, doc.y).strokeColor(cinza).stroke();
            doc.moveTo(315, doc.y).lineTo(525, doc.y).strokeColor(cinza).stroke();
            doc.fillColor(cinza).font("Helvetica").fontSize(8).text("Responsável pela solicitação", 70, doc.y + 6, { width: 210, align: "center" });
            doc.text("Aprovação", 315, doc.y + 6, { width: 210, align: "center" });

            const rodape = () => {
                doc.fillColor("#7a838d").font("Helvetica").fontSize(8).text(`${solicitacao.number} - BaileyBot`, 46, doc.page.height - 58, { width: largura, align: "center", lineBreak: false });
            };
            const paginas = doc.bufferedPageRange();
            for (let indice = paginas.start; indice < paginas.start + paginas.count; indice += 1) {
                doc.switchToPage(indice);
                rodape();
            }
            doc.end();
        });
    }
}

export default new CommissionPdfService();
