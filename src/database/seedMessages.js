import db from "./database.js";


export function seedMessages() {

    db.prepare(`
        INSERT OR IGNORE INTO message_templates (id, nome, mensagem)
        VALUES (1, ?, ?)
    `).run(
        "Primeiro contato",
        "Olá {nome}! Tudo bem? Aqui é o {vendedor} da Refricom. Estamos à disposição caso precise de algum produto ou orçamento. 😊"
    );

    db.prepare(`UPDATE message_templates
        SET mensagem = replace(mensagem, 'Noberto da Refricom', '{vendedor} da Refricom')
        WHERE id = 1 AND mensagem LIKE '%Noberto da Refricom%'`).run();

}
