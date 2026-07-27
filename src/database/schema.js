import db from "./database.js";

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
    cliente_id INTEGER NOT NULL,
    template_id INTEGER,
    mensagem TEXT,
    status TEXT DEFAULT 'enviado',
    enviado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cliente_id) REFERENCES users(id)
);

`);


db.prepare(`
INSERT OR IGNORE INTO message_templates (
    id,
    nome,
    mensagem
)
VALUES (
    1,
    'Primeiro contato',
    'Olá {nome}! Tudo bem? Aqui é o Noberto da Refricom. Estamos à disposição caso precise de algum produto ou orçamento. 😊'
)
`).run();


console.log("Banco de dados iniciado.");