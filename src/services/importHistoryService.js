import db from "../database/database.js";

const texto = valor => String(valor ?? "").trim();

class ImportHistoryService {
    iniciar({ module, filename, importedBy = "Administrador local", totalRows = 0 }) {
        const resultado = db.prepare(`INSERT INTO import_history(module,filename,imported_by,total_rows,status)
            VALUES(?,?,?,?,'processando')`).run(module, texto(filename) || "arquivo", texto(importedBy) || "Administrador local", totalRows);
        return Number(resultado.lastInsertRowid);
    }

    erro(id, { rowNumber = null, customerCode = null, movementNumber = null, error, rawData = null }) {
        db.prepare(`INSERT INTO import_history_errors
            (import_history_id,row_number,customer_code,movement_number,error,raw_data) VALUES(?,?,?,?,?,?)`)
            .run(id, rowNumber, customerCode, movementNumber, texto(error) || "Linha inválida.",
                rawData === null ? null : JSON.stringify(rawData));
    }

    concluir(id, dados = {}) {
        db.prepare(`UPDATE import_history SET total_rows=?,imported_rows=?,ignored_rows=?,duplicate_rows=?,
            created_customers=?,updated_customers=?,error_rows=?,status=?,finished_at=CURRENT_TIMESTAMP WHERE id=?`).run(
            Number(dados.totalRows) || 0, Number(dados.importedRows) || 0, Number(dados.ignoredRows) || 0,
            Number(dados.duplicateRows) || 0, Number(dados.createdCustomers) || 0,
            Number(dados.updatedCustomers) || 0, Number(dados.errorRows) || 0,
            dados.status || "concluida", id);
        return this.obter(id);
    }

    obter(id) {
        const history = db.prepare("SELECT * FROM import_history WHERE id=?").get(id);
        if (!history) return null;
        history.errors = db.prepare("SELECT * FROM import_history_errors WHERE import_history_id=? ORDER BY row_number,id").all(id);
        return history;
    }

    listar(limit = 100) {
        return db.prepare("SELECT * FROM import_history ORDER BY created_at DESC,id DESC LIMIT ?")
            .all(Math.min(500, Math.max(1, Number(limit) || 100)));
    }
}

export default new ImportHistoryService();
