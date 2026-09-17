import db from "../database/database.js";

const texto = valor => String(valor ?? "").trim();

class OperationLogService {
    registrar({ level = "info", module = "sistema", action, message, details = null }) {
        const niveis = new Set(["info", "warning", "error"]);
        return db.prepare(`INSERT INTO operation_logs(level,module,action,message,details)
            VALUES(?,?,?,?,?)`).run(niveis.has(level) ? level : "info", texto(module) || "sistema",
            texto(action) || "Operação", texto(message) || "Sem descrição.",
            details ? JSON.stringify(details) : null);
    }

    listar({ limit = 100, level = "" } = {}) {
        const limite = Math.min(500, Math.max(1, Number(limit) || 100));
        const niveis = new Set(["info", "warning", "error"]);
        const filtro = niveis.has(level) ? "WHERE level=?" : "";
        return db.prepare(`SELECT * FROM operation_logs ${filtro} ORDER BY created_at DESC,id DESC LIMIT ?`)
            .all(...(filtro ? [level] : []), limite)
            .map(item => ({ ...item, details: item.details ? JSON.parse(item.details) : null }));
    }
}

export default new OperationLogService();
