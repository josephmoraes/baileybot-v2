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
            ORDER BY name
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

    criar(dados) {

        const {
            customer_code,
            company_name,
            name,
            telefone
        } = dados;

        if (!telefone) {
            throw new Error("Telefone é obrigatório.");
        }

        if (!name?.trim() && !company_name?.trim()) {
            throw new Error("Informe o nome ou a empresa do cliente.");
        }

        const jid = formatarJid(telefone);
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

        if (!telefone) {
            throw new Error("Telefone é obrigatório.");
        }
        if (!name?.trim() && !company_name?.trim()) {
            throw new Error("Informe o nome ou a empresa do cliente.");
        }

        const jid = formatarJid(telefone);

        const cliente = db.prepare(`
            SELECT id
            FROM users
            WHERE id = ?
        `).get(id);

        if (!cliente) {
            throw new Error("Cliente não encontrado.");
        }

        const existente = db.prepare(`
            SELECT id
            FROM users
            WHERE jid = ?
            AND id != ?
        `).get(jid, id);

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
