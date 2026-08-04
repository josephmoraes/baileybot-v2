import db from "./database.js";

export function initDatabase() {
db.exec(`
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_name TEXT,
    name TEXT,
    jid TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS message_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    mensagem TEXT NOT NULL,
    ativo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER,
    cliente_nome TEXT NOT NULL,
    template_id INTEGER,
    mensagem TEXT,
    status TEXT DEFAULT 'enviado',
    enviado_em DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (cliente_id)
        REFERENCES users(id)
        ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    template_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'rascunho',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (template_id)
        REFERENCES message_templates(id)
        ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS campaign_recipients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL,
    cliente_id INTEGER,
    cliente_nome TEXT NOT NULL,
    cliente_jid TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pendente',
    erro TEXT,
    enviado_em DATETIME,

    FOREIGN KEY (campaign_id)
        REFERENCES campaigns(id)
        ON DELETE CASCADE,

    FOREIGN KEY (cliente_id)
        REFERENCES users(id)
        ON DELETE SET NULL,

    UNIQUE (campaign_id, cliente_jid)
);

CREATE INDEX IF NOT EXISTS idx_messages_sent_at ON messages(enviado_em DESC);
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign_status
    ON campaign_recipients(campaign_id, status);

CREATE TABLE IF NOT EXISTS technicians (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    og1_code TEXT NOT NULL UNIQUE,
    phone TEXT,
    email TEXT,
    document TEXT,
    commission_rate REAL NOT NULL DEFAULT 3,
    active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS commission_imports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    total_rows INTEGER NOT NULL DEFAULT 0,
    imported_rows INTEGER NOT NULL DEFAULT 0,
    error_rows INTEGER NOT NULL DEFAULT 0,
    sales_total REAL NOT NULL DEFAULT 0,
    commission_total REAL NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS commissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    movement TEXT NOT NULL UNIQUE,
    technician_id INTEGER NOT NULL,
    sale_date TEXT NOT NULL,
    sale_value REAL NOT NULL,
    rate REAL NOT NULL,
    commission_value REAL NOT NULL,
    release_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pendente',
    import_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (technician_id) REFERENCES technicians(id) ON DELETE RESTRICT,
    FOREIGN KEY (import_id) REFERENCES commission_imports(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS credit_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number TEXT UNIQUE,
    technician_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    request_date TEXT NOT NULL,
    requester TEXT NOT NULL,
    destination TEXT NOT NULL,
    materials TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'rascunho',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (technician_id) REFERENCES technicians(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS credit_request_commissions (
    request_id INTEGER NOT NULL,
    commission_id INTEGER NOT NULL UNIQUE,
    amount REAL NOT NULL,
    PRIMARY KEY (request_id, commission_id),
    FOREIGN KEY (request_id) REFERENCES credit_requests(id) ON DELETE CASCADE,
    FOREIGN KEY (commission_id) REFERENCES commissions(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_commissions_technician_status ON commissions(technician_id, status);

CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS blocked_contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jid TEXT NOT NULL UNIQUE,
    reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`);

const colunasUsers = db.prepare("PRAGMA table_info(users)").all();
if (!colunasUsers.some(coluna => coluna.name === "customer_code")) {
    db.exec("ALTER TABLE users ADD COLUMN customer_code TEXT");
}
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_customer_code ON users(customer_code) WHERE customer_code IS NOT NULL AND customer_code <> ''");

const adicionarColunaSeAusente = (tabela, coluna, definicao) => {
    const colunas = db.prepare(`PRAGMA table_info(${tabela})`).all();
    if (!colunas.some(item => item.name === coluna)) {
        db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${definicao}`);
    }
};

adicionarColunaSeAusente("campaigns", "validation_status", "TEXT NOT NULL DEFAULT 'nao_validada'");
adicionarColunaSeAusente("campaigns", "validated_at", "DATETIME");
adicionarColunaSeAusente("campaigns", "cancel_requested", "INTEGER NOT NULL DEFAULT 0");
adicionarColunaSeAusente("campaigns", "progress_total", "INTEGER NOT NULL DEFAULT 0");
adicionarColunaSeAusente("campaigns", "progress_processed", "INTEGER NOT NULL DEFAULT 0");
adicionarColunaSeAusente("campaigns", "current_recipient", "TEXT");
adicionarColunaSeAusente("campaigns", "next_send_at", "DATETIME");
adicionarColunaSeAusente("campaigns", "cooldown_ms", "INTEGER NOT NULL DEFAULT 0");
adicionarColunaSeAusente("campaign_recipients", "validation_status", "TEXT NOT NULL DEFAULT 'nao_validado'");
adicionarColunaSeAusente("campaign_recipients", "validation_error", "TEXT");
adicionarColunaSeAusente("campaign_recipients", "validated_jid", "TEXT");
adicionarColunaSeAusente("campaign_recipients", "validated_at", "DATETIME");
adicionarColunaSeAusente("campaign_recipients", "active", "INTEGER NOT NULL DEFAULT 1");
adicionarColunaSeAusente("messages", "campaign_id", "INTEGER");
adicionarColunaSeAusente("messages", "campaign_nome", "TEXT");

const inserirConfig = db.prepare("INSERT OR IGNORE INTO app_settings(key, value) VALUES(?, ?)");
inserirConfig.run("campaign_delay_ms", String(process.env.CAMPAIGN_DELAY_MS ?? 1500));
inserirConfig.run("seller_name", "Noberto");
inserirConfig.run("campaign_delay_min_ms", String(process.env.CAMPAIGN_DELAY_MS ?? 8000));
inserirConfig.run("campaign_delay_max_ms", String(process.env.CAMPAIGN_DELAY_MS ?? 15000));
inserirConfig.run("sending_start_time", "08:00");
inserirConfig.run("sending_end_time", "18:00");
inserirConfig.run("daily_message_limit", "200");
inserirConfig.run("notify_campaign_complete", "1");
console.log("Banco de dados iniciado.");
}
