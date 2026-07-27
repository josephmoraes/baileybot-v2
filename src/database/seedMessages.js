import db from "./database.js";


export function seedMessages() {

    const mensagens = [
        {
            nome: "Modelo A",
            mensagem:
                "Olá {nome}! Tudo bem? Aqui é da Refricom. Passando para saber como você está e me colocar à disposição caso precise de algum produto ou orçamento."
        },
        {
            nome: "Modelo B",
            mensagem:
                "Oi {nome}! Como você está? Aqui é da Refricom. Estou passando para saber se posso ajudar com algum produto ou orçamento."
        },
        {
            nome: "Modelo C",
            mensagem:
                "Bom dia {nome}! Tudo certo? Aqui é da Refricom. Estamos à disposição caso precise de algum produto, peça ou orçamento."
        },
        {
            nome: "Modelo D",
            mensagem:
                "Olá {nome}! Faz um tempo que não conversamos. Aqui é da Refricom e queria saber se você precisa de alguma coisa. Conte conosco! 😊"
        }
    ];


    const verificar = db.prepare(`
        SELECT COUNT(*) AS total 
        FROM message_templates
    `).get();


    if (verificar.total === 0) {

        const inserir = db.prepare(`
            INSERT INTO message_templates
            (nome, mensagem)
            VALUES (?, ?)
        `);


        mensagens.forEach(msg => {
            inserir.run(
                msg.nome,
                msg.mensagem
            );
        });


        console.log("Modelos de mensagens cadastrados.");

    } else {

        console.log("Modelos de mensagens já existem.");

    }

}