import db from "../database/database.js";
import customerService, { normalizarCodigoOg1 } from "./customerService.js";
import { resumoCliente } from "./customerAnalyticsService.js";

const tagsDoCliente = id => db.prepare(`SELECT t.id,t.name,t.color FROM reactivation_tags t
    JOIN reactivation_user_tags ut ON ut.tag_id=t.id WHERE ut.user_id=? ORDER BY t.name`).all(id);

function salvarTags(id, tags) {
    if (!Array.isArray(tags)) return;
    const ids = [...new Set(tags.map(Number).filter(Number.isInteger))];
    db.prepare("DELETE FROM reactivation_user_tags WHERE user_id=?").run(id);
    const inserir = db.prepare("INSERT OR IGNORE INTO reactivation_user_tags(user_id,tag_id) VALUES(?,?)");
    ids.forEach(tagId => inserir.run(id, tagId));
}

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
        `).all().map(cliente => ({ ...cliente, tags: tagsDoCliente(cliente.id) }));

    }

   buscarPorId(id) {

        const cliente = db.prepare(`
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
        return cliente ? { ...cliente, tags: tagsDoCliente(cliente.id) } : null;

    }

    buscarPorCodigo(codigo) {
        return customerService.buscarPorCodigo(codigo);
    }

    listarPaginado({ page = 1, perPage = 50, search = "", priority = "todos", status = "todos",
        seller = "todos", active = "todos", minDays = "", maxDays = "", sort = "az" } = {}) {
        const pagina = Math.max(1, Number(page) || 1);
        const limite = Math.min(100, Math.max(10, Number(perPage) || 50));
        const termo = String(search || "").trim();
        const telefone = termo.replace(/\D/g, "");
        const telefonePesquisavel = telefone.length >= 8 ? telefone : "";
        const where = termo ? `WHERE customer_code LIKE ? OR company_name LIKE ? OR name LIKE ? OR jid LIKE ?
            OR (? <> '' AND jid LIKE ?)
            OR EXISTS (SELECT 1 FROM reactivation_user_tags sut JOIN reactivation_tags st ON st.id=sut.tag_id
                WHERE sut.user_id=users.id AND st.name LIKE ?)` : "";
        const params = termo ? [
            ...Array(4).fill(`%${termo}%`),
            telefonePesquisavel,
            `%${telefonePesquisavel}%`,
            `%${termo}%`
        ] : [];
        const clientes = db.prepare(`SELECT id,customer_code,company_name,name,jid,seller,reactivation_status,last_movement_at,
            next_contact_at,priority_override,priority_notes,COALESCE(active,1) active,created_at FROM users ${where}`).all(...params);
        const metricas = db.prepare("SELECT * FROM customer_monthly_metrics ORDER BY user_id,period_start,id").all();
        const porCliente = new Map();
        metricas.forEach(item => { if (!porCliente.has(item.user_id)) porCliente.set(item.user_id, []); porCliente.get(item.user_id).push(item); });
        const enriquecidos = clientes.map(cliente => ({ ...cliente, ...resumoCliente(cliente, porCliente.get(cliente.id) || []) }));
        const minimo = minDays === "" ? null : Number(minDays); const maximo = maxDays === "" ? null : Number(maxDays);
        const filtrados = enriquecidos.filter(cliente =>
            (priority === "todos" || cliente.prioridade.level === priority) &&
            (status === "todos" || cliente.reactivation_status === status) &&
            (seller === "todos" || (cliente.seller || "Sem vendedor") === seller) &&
            (active === "todos" || String(cliente.active) === String(active === "ativo" ? 1 : 0)) &&
            (minimo === null || cliente.diasSemComprar !== null && cliente.diasSemComprar >= minimo) &&
            (maximo === null || cliente.diasSemComprar !== null && cliente.diasSemComprar <= maximo));
        const nome = item => (item.company_name || item.name || item.customer_code || "").toLocaleLowerCase("pt-BR");
        const ordenacoes = {
            az: (a, b) => nome(a).localeCompare(nome(b), "pt-BR"), za: (a, b) => nome(b).localeCompare(nome(a), "pt-BR"),
            revenue_desc: (a, b) => b.faturamento - a.faturamento, revenue_asc: (a, b) => a.faturamento - b.faturamento,
            growth_desc: (a, b) => b.crescimento - a.crescimento, fall_desc: (a, b) => a.crescimento - b.crescimento,
            days_desc: (a, b) => (b.diasSemComprar ?? -1) - (a.diasSemComprar ?? -1),
            days_asc: (a, b) => (a.diasSemComprar ?? Number.MAX_SAFE_INTEGER) - (b.diasSemComprar ?? Number.MAX_SAFE_INTEGER)
        };
        filtrados.sort(ordenacoes[sort] || ordenacoes.az);
        const total = filtrados.length; const pages = Math.max(1, Math.ceil(total / limite)); const currentPage = Math.min(pagina, pages);
        const items = filtrados.slice((currentPage - 1) * limite, currentPage * limite)
            .map(cliente => ({ ...cliente, tags: tagsDoCliente(cliente.id) }));
        return { items, page: currentPage, perPage: limite, total, pages,
            filters: { sellers: [...new Set(clientes.map(item => item.seller || "Sem vendedor"))].sort(),
                statuses: [...new Set(clientes.map(item => item.reactivation_status || "Não contatado"))].sort() } };
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
            const resultado = db.transaction(() => {
                if (!customer_code?.trim()) {
                    const inserido = db.prepare("INSERT INTO users(company_name,name,jid) VALUES(?,?,?)")
                        .run(company_name?.trim() || null, name?.trim() || null, jid);
                    return { customer: db.prepare("SELECT * FROM users WHERE id=?").get(inserido.lastInsertRowid), created: true, updated: false };
                }
                const upsert = customerService.upsertPorCodigo({ customer_code, company_name, name, jid });
                salvarTags(upsert.customer.id, dados.tag_ids);
                return upsert;
            })();
            return { success: true, id: resultado.customer.id, created: resultado.created, updated: resultado.updated };

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
            const codigoExistente = db.prepare("SELECT id FROM users WHERE UPPER(TRIM(customer_code)) = ? AND id != ?")
                .get(normalizarCodigoOg1(customer_code), id);
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
            normalizarCodigoOg1(customer_code) || null,
            company_name?.trim() || null,
            name?.trim() || null,
            jid,
            id
        );
        salvarTags(Number(id), dados.tag_ids);

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
