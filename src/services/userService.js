import db from "../database/database.js";

function formatarJid(numero) {

    let telefone = numero
        .replace(/\D/g, "");

    if (!telefone.startsWith("55")) {
        telefone = "55" + telefone;
    }

    if (!/^55\d{10,11}$/.test(telefone)) {
        throw new Error("Informe um telefone válido com DDD.");
    }

    return `${telefone}@s.whatsapp.net`;

}

class UserService {

    listar() {

        return db.prepare(`
            SELECT
                id,
                customer_code,
                company_name,
                name,
                jid,
                created_at
            FROM users
            ORDER BY COALESCE(NULLIF(company_name, ''), name)
        `).all();

    }

   buscarPorId(id) {

        return db.prepare(`
            SELECT
                id,
                customer_code,
                company_name,
                name,
                jid,
                created_at
            FROM users
            WHERE id = ?
        `).get(id);

    }

    buscarPorCodigo(codigo) {
        if (!codigo?.trim()) return null;
        return db.prepare("SELECT id FROM users WHERE customer_code = ?").get(codigo.trim());
    }

    listarPaginado({ page = 1, perPage = 50, search = "" } = {}) {
        const pagina = Math.max(1, Number(page) || 1);
        const limite = Math.min(100, Math.max(10, Number(perPage) || 50));
        const termo = String(search || "").trim();
        const where = termo ? "WHERE customer_code LIKE ? OR company_name LIKE ? OR name LIKE ? OR jid LIKE ?" : "";
        const params = termo ? Array(4).fill(`%${termo}%`) : [];
        const total = db.prepare(`SELECT COUNT(*) total FROM users ${where}`).get(...params).total;
        const items = db.prepare(`SELECT id,customer_code,company_name,name,jid,created_at FROM users ${where}
            ORDER BY COALESCE(NULLIF(company_name,''),name),id LIMIT ? OFFSET ?`).all(...params, limite, (pagina - 1) * limite);
        return { items, page: pagina, perPage: limite, total, pages: Math.max(1, Math.ceil(total / limite)) };
    }

    criar(dados) {

        const {
            customer_code,
            company_name,
            name,
            telefone
        } = dados;

        if (!customer_code?.trim() && !name?.trim() && !company_name?.trim()) {
            throw new Error("Informe o código, o nome ou a empresa do cliente.");
        }

        const jid = telefone?.trim() ? formatarJid(telefone) : null;
        try {

            db.prepare(`
                INSERT INTO users (
                    customer_code,
                    company_name,
                    name,
                    jid
                )
                VALUES (?, ?, ?, ?)
            `).run(
                customer_code?.trim() || null,
                company_name?.trim() || null,
                name?.trim() || null,
                jid
            );

            return {
                success: true
            };

        } catch (erro) {

            if (erro.code === "SQLITE_CONSTRAINT_UNIQUE") {
                if (customer_code && db.prepare("SELECT id FROM users WHERE customer_code = ?").get(customer_code.trim())) {
                    throw new Error("Este código de cliente já está cadastrado.");
                }
                throw new Error("Este telefone já está cadastrado.");
            }

            throw erro;

        }

    }

    atualizar(id, dados) {

        const {
            customer_code,
            company_name,
            name,
            telefone
        } = dados;

        if (!customer_code?.trim() && !name?.trim() && !company_name?.trim()) {
            throw new Error("Informe o código, o nome ou a empresa do cliente.");
        }

        const jid = telefone?.trim() ? formatarJid(telefone) : null;

        const cliente = db.prepare(`
            SELECT id
            FROM users
            WHERE id = ?
        `).get(id);

        if (!cliente) {
            throw new Error("Cliente não encontrado.");
        }

        const existente = jid ? db.prepare(`
            SELECT id
            FROM users
            WHERE jid = ?
            AND id != ?
        `).get(jid, id) : null;

        if (existente) {
            throw new Error("Telefone já cadastrado.");
        }

        if (customer_code?.trim()) {
            const codigoExistente = db.prepare("SELECT id FROM users WHERE customer_code = ? AND id != ?")
                .get(customer_code.trim(), id);
            if (codigoExistente) throw new Error("Código de cliente já cadastrado.");
        }

        db.prepare(`
            UPDATE users
            SET
                customer_code = ?,
                company_name = ?,
                name = ?,
                jid = ?
            WHERE id = ?
        `).run(
            customer_code?.trim() || null,
            company_name?.trim() || null,
            name?.trim() || null,
            jid,
            id
        );

        return {
            success: true
        };

    }

    excluir(id) {

        const cliente = db.prepare(`
            SELECT id
            FROM users
            WHERE id = ?
        `).get(id);

        if (!cliente) {
            throw new Error("Cliente não encontrado.");
        }

        db.prepare(`
            DELETE FROM users
            WHERE id = ?
        `).run(id);

        return {
            success: true
        };

    }
    

    
}

export default new UserService();
