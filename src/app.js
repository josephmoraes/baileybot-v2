import dotenv from "dotenv";
import { startServer } from "./server/server.js";

dotenv.config();

export function startApp() {

    const port = process.env.PORT || 3000;

    startServer(port);

}