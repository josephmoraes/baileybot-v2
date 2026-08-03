//Banco de Dados
import express from "express";

//Routes
import usersRoutes from "./routes/users.js";
import whatsappRoutes from "./routes/whatsapp.js";
import apiRoutes from "./routes/api.js";
import messagesRouter from "./routes/messagesRouter.js";
import campaignsRoutes from "./routes/campaigns.js";
import settingsRoutes from "./routes/settings.js";
import commissionsRoutes from "./routes/commissions.js";

//
import path from "path";
import { fileURLToPath } from "url";
import db from "../database/database.js";
import whatsappService from "../services/whatsappService.js";


const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "../public")));

app.use(express.json({ limit: "10mb" }));
app.use("/api/users", usersRoutes);
app.use("/api/whatsapp", whatsappRoutes);
app.use("/api", apiRoutes);
app.use("/api/messages", messagesRouter);
app.use("/api/campaigns", campaignsRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/commissions", commissionsRoutes);

app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});

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

    const totalCampanhas = db
        .prepare("SELECT COUNT(*) AS total FROM campaigns")
        .get().total;
        
    res.json({
        totalClientes,
        totalCampanhas,
        totalMensagens,
        whatsapp: whatsappService.getStatus()
    });

});

app.use((req, res, next) => {
    if (req.path.startsWith("/api/")) {
        return res.status(404).json({ error: "Rota não encontrada." });
    }
    next();
});

app.use((erro, req, res, next) => {
    console.error(erro);
    if (res.headersSent) return next(erro);
    res.status(500).json({ error: "Erro interno do servidor." });
});

export { app };

export function startServer(port) {
    const server = app.listen(port, () => {
        console.log("=================================");
        console.log(" 🌐 Servidor iniciado");
        console.log(` http://localhost:${port}`);
        console.log("=================================");
    });

    return server;
}
