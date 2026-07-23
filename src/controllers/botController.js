import { iniciarBot as iniciarBotService } from "../services/botManager.js";

export async function iniciarBot(req, res) {
    try {
        await iniciarBotService();

        res.json({
            sucesso: true
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            sucesso: false,
            erro: error.message
        });
    }
}