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
    startServer(port);

}
