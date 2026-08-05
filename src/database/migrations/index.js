import db from "../database.js";

const adicionarColuna = (tabela, coluna, definicao) => {
    const colunas = db.prepare(`PRAGMA table_info(${tabela})`).all();
    if (!colunas.some(item => item.name === coluna)) db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${definicao}`);
};

const migrations = [
    {
        id: "001_compatibilidade_v2",
        up() {
            adicionarColuna("users", "customer_code", "TEXT");
            adicionarColuna("campaigns", "validation_status", "TEXT NOT NULL DEFAULT 'nao_validada'");
            adicionarColuna("campaigns", "validated_at", "DATETIME");
            adicionarColuna("campaigns", "cancel_requested", "INTEGER NOT NULL DEFAULT 0");
            adicionarColuna("campaigns", "progress_total", "INTEGER NOT NULL DEFAULT 0");
            adicionarColuna("campaigns", "progress_processed", "INTEGER NOT NULL DEFAULT 0");
            adicionarColuna("campaigns", "current_recipient", "TEXT");
            adicionarColuna("campaigns", "next_send_at", "DATETIME");
            adicionarColuna("campaigns", "cooldown_ms", "INTEGER NOT NULL DEFAULT 0");
            adicionarColuna("campaign_recipients", "validation_status", "TEXT NOT NULL DEFAULT 'nao_validado'");
            adicionarColuna("campaign_recipients", "validation_error", "TEXT");
            adicionarColuna("campaign_recipients", "validated_jid", "TEXT");
            adicionarColuna("campaign_recipients", "validated_at", "DATETIME");
            adicionarColuna("campaign_recipients", "active", "INTEGER NOT NULL DEFAULT 1");
            adicionarColuna("messages", "campaign_id", "INTEGER");
            adicionarColuna("messages", "campaign_nome", "TEXT");
            db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_customer_code ON users(customer_code) WHERE customer_code IS NOT NULL AND customer_code <> ''");
        }
    }
];

export function executarMigrations() {
    db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    const aplicada = db.prepare("SELECT 1 FROM schema_migrations WHERE id = ?");
    const registrar = db.prepare("INSERT INTO schema_migrations(id) VALUES(?)");
    for (const migration of migrations) {
        if (aplicada.get(migration.id)) continue;
        db.transaction(() => {
            migration.up();
            registrar.run(migration.id);
        })();
    }
}
