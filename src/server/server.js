import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import db from "../database/database.js";

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "../public")));

app.use(express.json());

// Página principal
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "../public/index.html"));
});

// API do Dashboard
app.get("/api/dashboard", (req, res) => {

    const totalClientes = db
        .prepare("SELECT COUNT(*) AS total FROM users")
        .get().total;

    const totalMensagens = db
        .prepare("SELECT COUNT(*) AS total FROM messages")
        .get().total;

    res.json({
        totalClientes,
        totalCampanhas: 0,
        totalMensagens,
        whatsappConectado: false
    });

});

app.get("/api/users", (req, res) => {

    const users = db.prepare(`
        SELECT
            id,
            company_name,
            name,
            jid,
            created_at
        FROM users
    `).all();

    res.json(users);

});

app.post("/api/users", (req, res) => {

    const {
        company_name,
        name,
        jid
    } = req.body;

    if (!jid) {

        return res.status(400).json({
            error: "Telefone é obrigatório."
        });

    }

    try {

        db.prepare(`
            INSERT INTO users (
                company_name,
                name,
                jid
            )
            VALUES (?, ?, ?)
        `).run(
            company_name,
            name,
            jid
        );

        res.json({
            success: true
        });

    } catch (erro) {

        console.error(erro);


        if (erro.code === "SQLITE_CONSTRAINT_UNIQUE") {

            return res.status(400).json({
                error: "Este telefone já está cadastrado."
            });

        }


        res.status(500).json({
            error: "Erro ao cadastrar cliente."
        });

    }

});

// Atualizar cliente
app.put("/api/users/:id", (req, res) => {

    console.log("EDITANDO ID:", req.params.id);
    console.log("DADOS:", req.body);

    const id = req.params.id;

    const {
        company_name,
        name,
        jid
    } = req.body;


    if (existente) {

        return res.status(400).json({
            error: "Telefone já cadastrado."
        });

    }


    try {

        db.prepare(`
            UPDATE users
            SET
                company_name = ?,
                name = ?,
                jid = ?
            WHERE id = ?
        `).run(
            company_name,
            name,
            jid,
            id
        );


        res.json({
            success: true
        });


    } catch (erro) {

        console.error(erro);

        res.status(500).json({
            error: "Erro ao atualizar cliente."
        });

    }

});

export function startServer(port) {

    const server = app.listen(port, () => {
        console.log("=================================");
        console.log(" 🌐 Servidor iniciado");
        console.log(` http://localhost:${port}`);
        console.log("=================================");
    });

    return server;

}