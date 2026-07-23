import express from "express";
import usersRoutes from "./routes/users.js";
import whatsappRoutes from "./routes/whatsapp.js";
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