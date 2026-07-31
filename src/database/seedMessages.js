import db from "./database.js";


export function seedMessages() {

    db.prepare(`
        INSERT OR IGNORE INTO message_templates (id, nome, mensagem)
        VALUES (1, ?, ?)
    `).run(
        "Primeiro contato",
        "Olá {nome}! Tudo bem? Aqui é o Noberto da Refricom. Estamos à disposição caso precise de algum produto ou orçamento. 😊"
    );

}
