import db from "./database.js";


export function initDatabase() {

    db.exec(`

        CREATE TABLE IF NOT EXISTS message_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            mensagem TEXT NOT NULL,
            ativo INTEGER DEFAULT 1
        );


        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cliente_id INTEGER NOT NULL,
            template_id INTEGER,
            mensagem TEXT NOT NULL,
            status TEXT DEFAULT 'pendente',
            enviado_em DATETIME,

            FOREIGN KEY (cliente_id)
            REFERENCES users(id),

            FOREIGN KEY (template_id)
            REFERENCES message_templates(id)
        );

    `);


    console.log("Banco de mensagens inicializado.");
}