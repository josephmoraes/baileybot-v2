import db from "../database/database.js";

class DashboardRepository {
    obterIndicadores() {
        return db.prepare(`
            SELECT
                (SELECT COUNT(*) FROM users) AS totalClientes,
                (SELECT COUNT(*) FROM messages WHERE status = 'enviado') AS totalMensagens,
                (SELECT COUNT(*) FROM messages WHERE status = 'enviado' AND date(enviado_em) = date('now','localtime')) AS mensagensHoje,
                (SELECT COUNT(*) FROM campaigns) AS totalCampanhas,
                (SELECT COUNT(*) FROM campaigns WHERE status IN ('pronta','enviando','pausada')) AS campanhasAtivas,
                (SELECT COUNT(*) FROM technicians WHERE active = 1) AS totalTecnicos,
                (SELECT COALESCE(SUM(commission_value), 0) FROM commissions WHERE status = 'pendente') AS comissaoPendente,
                (SELECT COALESCE(SUM(commission_value), 0) FROM commissions WHERE status = 'liberada') AS comissaoLiberada,
                (SELECT COUNT(*) FROM messages WHERE status = 'erro' AND date(enviado_em) = date('now','localtime')) AS errosHoje,
                (SELECT COUNT(*) FROM campaigns WHERE status = 'erro') AS campanhasComErro
        `).get();
    }

    listarMensagensSemana() {
        return db.prepare(`
            WITH RECURSIVE dias(data) AS (
                SELECT date('now','localtime','-6 days')
                UNION ALL SELECT date(data,'+1 day') FROM dias WHERE data < date('now','localtime')
            )
            SELECT dias.data, COUNT(messages.id) AS total
            FROM dias
            LEFT JOIN messages ON date(messages.enviado_em) = dias.data AND messages.status = 'enviado'
            GROUP BY dias.data ORDER BY dias.data
        `).all();
    }

    listarCampanhasRecentes(limite = 5) {
        return db.prepare(`
            SELECT c.id, c.nome, c.status, c.updated_at,
                   COUNT(cr.id) AS totalDestinatarios,
                   SUM(CASE WHEN cr.status = 'enviado' THEN 1 ELSE 0 END) AS enviados
            FROM campaigns c
            LEFT JOIN campaign_recipients cr ON cr.campaign_id = c.id AND cr.active = 1
            GROUP BY c.id ORDER BY datetime(c.updated_at) DESC LIMIT ?
        `).all(limite);
    }

    listarEnviosRecentes(limite = 5) {
        return db.prepare(`
            SELECT id, cliente_nome AS cliente, campaign_nome AS campanha, status, enviado_em
            FROM messages ORDER BY datetime(enviado_em) DESC, id DESC LIMIT ?
        `).all(limite);
    }

    listarAtividades(limite = 6) {
        return db.prepare(`
            SELECT tipo, titulo, descricao, data FROM (
                SELECT 'mensagem' AS tipo, 'Mensagem enviada' AS titulo, cliente_nome AS descricao, enviado_em AS data FROM messages
                UNION ALL SELECT 'campanha', 'Campanha atualizada', nome, updated_at FROM campaigns
                UNION ALL SELECT 'cliente', 'Novo cliente cadastrado', COALESCE(name,company_name,'Cliente'), created_at FROM users
            ) ORDER BY datetime(data) DESC LIMIT ?
        `).all(limite);
    }
}

export default new DashboardRepository();
