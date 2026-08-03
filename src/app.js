import dotenv from "dotenv";
import "./database/database.js";
import { initDatabase } from "./database/schema.js";
import { seedMessages } from "./database/seedMessages.js";
import { startServer } from "./server/server.js";


dotenv.config();

export function startApp() {

    const port = process.env.PORT || 3000;

    initDatabase();
    seedMessages();
    const server = startServer(port);

    const encerrar = signal => {
        console.log(`Encerrando BaileyBot (${signal})...`);
        server.close(() => process.exit(0));
        setTimeout(() => process.exit(1), 5000).unref();
    };

    process.once("SIGINT", () => encerrar("SIGINT"));
    process.once("SIGTERM", () => encerrar("SIGTERM"));

    return server;

}
