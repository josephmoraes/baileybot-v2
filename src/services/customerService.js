import db from "../database/database.js";

const texto = valor => String(valor ?? "").trim();

export function normalizarCodigoOg1(valor) {
    return texto(valor).toUpperCase();
}

function valorPreservado(valor) {
    const normalizado = texto(valor);
    return normalizado || null;
}

class CustomerService {
    buscarPorCodigo(codigo) {
        const normalizado = normalizarCodigoOg1(codigo);
        if (!normalizado) return null;
        return db.prepare("SELECT * FROM users WHERE UPPER(TRIM(customer_code))=?").get(normalizado) || null;
    }

    upsertPorCodigo(dados = {}) {
        const codigo = normalizarCodigoOg1(dados.customer_code);
        if (!codigo) throw new Error("Código OG1 é obrigatório.");
        const existente = this.buscarPorCodigo(codigo);
        if (existente) {
            db.prepare(`UPDATE users SET
                customer_code=?,
                company_name=COALESCE(NULLIF(?,''),company_name),
                name=COALESCE(NULLIF(?,''),name),
                jid=COALESCE(?,jid),
                seller=COALESCE(NULLIF(?,''),seller)
                WHERE id=?`).run(codigo, texto(dados.company_name), texto(dados.name), dados.jid || null,
                texto(dados.seller), existente.id);
            return { customer: db.prepare("SELECT * FROM users WHERE id=?").get(existente.id), created: false, updated: true };
        }
        const resultado = db.prepare(`INSERT INTO users(customer_code,company_name,name,jid,seller,reactivation_status)
            VALUES(?,?,?,?,?,'Não contatado')`).run(codigo, valorPreservado(dados.company_name), valorPreservado(dados.name),
            dados.jid || null, valorPreservado(dados.seller));
        return { customer: db.prepare("SELECT * FROM users WHERE id=?").get(resultado.lastInsertRowid), created: true, updated: false };
    }
}

export default new CustomerService();
