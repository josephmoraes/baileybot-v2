import db from "../database/database.js";

function formatarJid(numero) {

    let telefone = numero
        .replace(/\D/g, "");

    if (!telefone.startsWith("55")) {
        telefone = "55" + telefone;
    }

    return `${telefone}@s.whatsapp.net`;

}

class UserService {

    listar() {

        return db.prepare(`
            SELECT
                id,
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
                company_name,
                name,
                jid,
                created_at
            FROM users
            WHERE id = ?
        `).get(id);

    }

    criar(dados) {

        const {
            company_name,
            name,
            telefone
        } = dados;

        if (!telefone) {
            throw new Error("Telefone é obrigatório.");
        }

        const jid = formatarJid(telefone);
        try {

            db.prepare(`
                INSERT INTO users (
                    company_name,
                    name,
                    jid
                )
                VALUES (?, ?, ?)
            `).run(
                company_name,
                name,
                jid
            );

            return {
                success: true
            };

        } catch (erro) {

            if (erro.code === "SQLITE_CONSTRAINT_UNIQUE") {
                throw new Error("Este telefone já está cadastrado.");
            }

            throw erro;

        }

    }

    atualizar(id, dados) {

        const {
            company_name,
            name,
            telefone
        } = dados;

        if (!telefone) {
            throw new Error("Telefone é obrigatório.");
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

        db.prepare(`
            UPDATE users
            SET
                company_name = ?,
                name = ?,
                jid = ?
            WHERE id = ?
        `).run(
            company_name,
            name,
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
