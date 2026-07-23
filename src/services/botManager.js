import whatsapp from "./whatsapp.js";

export async function iniciarBot() {
    await whatsapp.conectar();
}