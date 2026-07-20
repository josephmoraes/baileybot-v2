import express from "express";
import usersRoutes from "./routes/users.js";
import path from "path";
import { fileURLToPath } from "url";
import db from "../database/database.js";


const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "../public")));

app.use(express.json());
app.use("/api/users", usersRoutes);

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

    const id = req.params.id;

    const {
        company_name,
        name,
        jid
    } = req.body;

    // Verifica se o cliente existe
    const cliente = db.prepare(`
        SELECT id
        FROM users
        WHERE id = ?
    `).get(id);

    if (!cliente) {
        return res.status(404).json({
            error: "Cliente não encontrado."
        });
    }

    // Verifica telefone duplicado
    const existente = db.prepare(`
        SELECT id
        FROM users
        WHERE jid = ?
        AND id != ?
    `).get(jid, id);

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
    
app.delete("/api/users/:id", (req, res) => {

    const id = req.params.id;

    // verifica se o cliente existe
    const cliente = db.prepare(`
        SELECT id
        FROM users
        WHERE id = ?
    `).get(id);

    if (!cliente) {
        return res.status(404).json({
            error: "Cliente não encontrado."
        });
    }

    try {

        // exclui
        db.prepare(`
            DELETE FROM users
            WHERE id = ?
        `).run(id);

        // retorna success
        res.json({
            success: true
        });

    } catch (erro) {

        console.error(erro);

        res.status(500).json({
            error: "Erro ao excluir cliente."
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