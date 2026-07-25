import whatsapp from "./whatsappService.js";

export async function iniciarBot() {
    await whatsapp.conectar();
}