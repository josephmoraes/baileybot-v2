import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import usersRoutes from "./routes/users.js";
import whatsappRoutes from "./routes/whatsapp.js";
import apiRoutes from "./routes/api.js";
import messagesRouter from "./routes/messagesRouter.js";
import campaignsRoutes from "./routes/campaigns.js";
import settingsRoutes from "./routes/settings.js";
import commissionsRoutes from "./routes/commissions.js";
import dashboardRoutes from "./routes/dashboard.js";
import authRoutes from "./routes/auth.js";
import { protegerApi } from "../middleware/adminSession.js";

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.disable("x-powered-by");
app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "same-origin");
    next();
});
app.use(express.static(path.join(__dirname, "../public"), { maxAge: process.env.NODE_ENV === "production" ? "1h" : 0 }));
app.use(express.json({ limit: "10mb" }));

app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});
app.use("/api/auth", authRoutes);
app.use("/api", protegerApi);
app.use("/api/users", usersRoutes);
app.use("/api/whatsapp", whatsappRoutes);
app.use("/api/messages", messagesRouter);
app.use("/api/campaigns", campaignsRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/commissions", commissionsRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api", apiRoutes);

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "../public/index.html")));

app.use((req, res, next) => {
    if (req.path.startsWith("/api/")) return res.status(404).json({ error: "Rota não encontrada." });
    next();
});

app.use((erro, req, res, next) => {
    if (res.headersSent) return next(erro);
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`, erro);
    res.status(erro.status || 500).json({
        error: erro.status && erro.status < 500 ? erro.message : "Erro interno do servidor."
    });
});

export { app };

export function startServer(port, host = process.env.HOST || "127.0.0.1") {
    const server = app.listen(port, host, () => {
        console.log(`BaileyBot disponível em http://${host}:${port}`);
    });
    return server;
}
