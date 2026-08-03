import XLSX from "xlsx";
import db from "../database/database.js";

const hoje = () => new Date().toISOString().slice(0, 10);
const chave = valor => String(valor ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const campo = (linha, nomes) => {
    const mapa = Object.fromEntries(Object.entries(linha).map(([k, v]) => [chave(k), v]));
    for (const nome of nomes) if (mapa[chave(nome)] !== undefined && String(mapa[chave(nome)]).trim()) return mapa[chave(nome)];
    return "";
};
const numero = valor => {
    if (typeof valor === "number") return valor;
    const texto = String(valor ?? "").replace(/R\$|\s/g, "");
    return Number(texto.includes(",") ? texto.replaceAll(".", "").replace(",", ".") : texto);
};
const dataIso = valor => {
    if (typeof valor === "number") return XLSX.SSF.format("yyyy-mm-dd", valor);
    const texto = String(valor ?? "").trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(texto)) return texto.slice(0, 10);
    const partes = texto.split(/[\/\-]/);
    if (partes.length === 3) return `${partes[2].padStart(4, "20")}-${partes[1].padStart(2, "0")}-${partes[0].padStart(2, "0")}`;
    return "";
};
const somarDias = (data, dias) => { const d = new Date(`${data}T12:00:00`); d.setDate(d.getDate() + dias); return d.toISOString().slice(0, 10); };

class CommissionService {
    listarTecnicos() {
        return db.prepare(`SELECT t.*, COALESCE(SUM(c.commission_value),0) total,
            COALESCE(SUM(CASE WHEN c.status='liberada' THEN c.commission_value ELSE 0 END),0) liberado,
            COALESCE(SUM(CASE WHEN c.status='pendente' THEN c.commission_value ELSE 0 END),0) pendente
            FROM technicians t LEFT JOIN commissions c ON c.technician_id=t.id GROUP BY t.id ORDER BY t.name`).all();
    }
    salvarTecnico(dados, id) {
        if (!dados.name?.trim() || !dados.og1Code?.trim()) throw new Error("Nome e código OG1 são obrigatórios.");
        const params = [dados.name.trim(), dados.og1Code.trim(), dados.phone?.trim() || null, dados.email?.trim() || null, dados.document?.trim() || null, Number(dados.commissionRate) || 3, dados.active === false ? 0 : 1];
        try {
            if (id) {
                const r = db.prepare(`UPDATE technicians SET name=?,og1_code=?,phone=?,email=?,document=?,commission_rate=?,active=? WHERE id=?`).run(...params, id);
                if (!r.changes) throw new Error("Técnico não encontrado.");
            } else db.prepare(`INSERT INTO technicians(name,og1_code,phone,email,document,commission_rate,active) VALUES(?,?,?,?,?,?,?)`).run(...params);
        } catch (erro) { if (erro.code === "SQLITE_CONSTRAINT_UNIQUE") throw new Error("Código OG1 já cadastrado."); throw erro; }
        return { success: true };
    }
    dashboard() {
        this.atualizarLiberacoes();
        const resumo = db.prepare(`SELECT COUNT(DISTINCT t.id) tecnicos,
            COALESCE(SUM(c.sale_value),0) vendas, COALESCE(SUM(c.commission_value),0) comissoes,
            COALESCE(SUM(CASE WHEN c.status='liberada' THEN c.commission_value ELSE 0 END),0) liberado,
            COALESCE(SUM(CASE WHEN c.status='pendente' THEN c.commission_value ELSE 0 END),0) pendente
            FROM technicians t LEFT JOIN commissions c ON c.technician_id=t.id AND substr(c.sale_date,1,7)=substr(?,1,7) WHERE t.active=1`).get(hoje());
        const ranking = db.prepare(`SELECT t.name,COUNT(c.id) vendas_count,COALESCE(SUM(c.sale_value),0) total FROM technicians t LEFT JOIN commissions c ON c.technician_id=t.id GROUP BY t.id ORDER BY total DESC`).all();
        return { resumo, maiores: ranking.slice(0,5), menores: [...ranking].sort((a,b)=>a.total-b.total).slice(0,5) };
    }
    atualizarLiberacoes() { db.prepare(`UPDATE commissions SET status='liberada' WHERE status='pendente' AND release_date<=?`).run(hoje()); }
    listarComissoes() { this.atualizarLiberacoes(); return db.prepare(`SELECT c.*,t.name technician_name,t.og1_code FROM commissions c JOIN technicians t ON t.id=c.technician_id ORDER BY c.sale_date DESC,c.id DESC LIMIT 500`).all(); }
    listarImportacoes() { return db.prepare(`SELECT * FROM commission_imports ORDER BY id DESC LIMIT 50`).all(); }
    importar({ base64, filename }) {
        if (!base64) throw new Error("Selecione um arquivo CSV ou Excel.");
        const wb = XLSX.read(Buffer.from(base64,"base64"),{type:"buffer"});
        const linhas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:""});
        if (!linhas.length) throw new Error("O arquivo está vazio.");
        const imp = db.prepare(`INSERT INTO commission_imports(filename,total_rows) VALUES(?,?)`).run(filename || "importacao.xlsx",linhas.length).lastInsertRowid;
        let importados=0,erros=0,vendas=0,comissoes=0,tecnicosCriados=0;
        const inserir=db.prepare(`INSERT INTO commissions(movement,technician_id,sale_date,sale_value,rate,commission_value,release_date,status,import_id) VALUES(?,?,?,?,?,?,?,?,?)`);
        const transacao=db.transaction(()=>linhas.forEach(linha=>{
            try {
                const movimento=String(campo(linha,["movimento","numero","venda","pedido"])).trim();
                const codigo=String(campo(linha,["codigo tecnico","codigo og1","tecnico codigo","tecnico"])).trim();
                let tecnico=db.prepare(`SELECT * FROM technicians WHERE og1_code=?`).get(codigo);
                if (!tecnico && codigo) {
                    const nomeTecnico=String(campo(linha,["nome tecnico","tecnico nome","tecnico","vendedor","nome vendedor"])).trim();
                    if (!nomeTecnico) throw new Error();
                    const telefone=String(campo(linha,["telefone tecnico","celular tecnico","telefone vendedor"])).trim() || null;
                    const email=String(campo(linha,["email tecnico","email vendedor"])).trim() || null;
                    const documento=String(campo(linha,["cpf tecnico","cnpj tecnico","documento tecnico"])).trim() || null;
                    const taxaPlanilha=numero(campo(linha,["percentual","comissao percentual","taxa"])) || 3;
                    const id=db.prepare(`INSERT INTO technicians(name,og1_code,phone,email,document,commission_rate) VALUES(?,?,?,?,?,?)`).run(nomeTecnico,codigo,telefone,email,documento,taxaPlanilha).lastInsertRowid;
                    tecnico=db.prepare(`SELECT * FROM technicians WHERE id=?`).get(id);
                    tecnicosCriados++;
                }
                const valor=numero(campo(linha,["valor venda","valor","total"]));
                const data=dataIso(campo(linha,["data venda","data","emissao"]));
                if(!movimento||!tecnico||!data||!Number.isFinite(valor)||valor<=0) throw new Error();
                const taxa=numero(campo(linha,["percentual","comissao percentual","taxa"])) || tecnico.commission_rate;
                const comissao=Number((valor*taxa/100).toFixed(2));
                const liberacao=dataIso(campo(linha,["data liberacao","liberacao"])) || somarDias(data,7);
                inserir.run(movimento,tecnico.id,data,valor,taxa,comissao,liberacao,liberacao<=hoje()?"liberada":"pendente",imp);
                importados++; vendas+=valor; comissoes+=comissao;
            } catch { erros++; }
        })); transacao();
        db.prepare(`UPDATE commission_imports SET imported_rows=?,error_rows=?,sales_total=?,commission_total=? WHERE id=?`).run(importados,erros,vendas,comissoes,imp);
        return { total:linhas.length,importados,erros,vendas,comissoes,tecnicosCriados };
    }
    creditosDisponiveis(tecnicoId) { this.atualizarLiberacoes(); return db.prepare(`SELECT c.* FROM commissions c LEFT JOIN credit_request_commissions rc ON rc.commission_id=c.id WHERE c.technician_id=? AND c.status='liberada' AND rc.commission_id IS NULL ORDER BY c.release_date`).all(tecnicoId); }
    criarSolicitacao(d) {
        const ids=[...new Set((d.commissionIds||[]).map(Number).filter(Number.isInteger))];
        if(!d.technicianId||!ids.length||!d.requester?.trim()) throw new Error("Técnico, créditos e responsável são obrigatórios.");
        const creditos=this.creditosDisponiveis(d.technicianId).filter(c=>ids.includes(c.id));
        if(creditos.length!==ids.length) throw new Error("Um ou mais créditos não estão disponíveis.");
        const total=creditos.reduce((s,c)=>s+c.commission_value,0);
        const criar=db.transaction(()=>{ const r=db.prepare(`INSERT INTO credit_requests(technician_id,amount,request_date,requester,destination,materials,notes,status) VALUES(?,?,?,?,?,?,?,?)`).run(d.technicianId,total,d.requestDate||hoje(),d.requester.trim(),d.destination||"Financeiro",d.materials||null,d.notes||null,d.draft?"rascunho":"gerada"); const numeroReq=`SC-${new Date().getFullYear()}-${String(r.lastInsertRowid).padStart(4,"0")}`; db.prepare(`UPDATE credit_requests SET number=? WHERE id=?`).run(numeroReq,r.lastInsertRowid); const link=db.prepare(`INSERT INTO credit_request_commissions(request_id,commission_id,amount) VALUES(?,?,?)`); creditos.forEach(c=>link.run(r.lastInsertRowid,c.id,c.commission_value)); return {id:r.lastInsertRowid,number:numeroReq,amount:total}; });
        return criar();
    }
    listarSolicitacoes(){ return db.prepare(`SELECT r.*,t.name technician_name,t.og1_code FROM credit_requests r JOIN technicians t ON t.id=r.technician_id ORDER BY r.id DESC`).all(); }
}
export default new CommissionService();
