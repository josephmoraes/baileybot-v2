//Banco de Dados
import express from "express";

import { initDatabase } from "../database/initDatabase.js";
initDatabase();
import { seedMessages } from "../database/seedMessages.js";
seedMessages();

//Routes
import usersRoutes from "./routes/users.js";
import whatsappRoutes from "./routes/whatsapp.js";
import apiRoutes from "./routes/api.js";
import messagesRouter from "./routes/messagesRouter.js";

//
import path from "path";
import { fileURLToPath } from "url";
import db from "../database/database.js";


const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "../public")));

app.use(express.json());
app.use("/api/users", usersRoutes);
app.use("/api/whatsapp", whatsappRoutes);
app.use("/api", apiRoutes);
app.use("/api/messages", messagesRouter);

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
        whatsapp: "Desconectado"
    });

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