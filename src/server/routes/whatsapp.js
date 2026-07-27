import express from "express";
import whatsappService from "../../services/whatsappService.js";

const router = express.Router();

// Status da conexão
router.get("/status", (req, res) => {

    res.json({
        status: whatsappService.getStatus()
    });

});

// QR Code atual
router.get("/qrcode", (req, res) => {

    res.json({
        qr: whatsappService.getQRCode()
    });

});

// Solicita conexão
router.post("/connect", async (req, res) => {

    try {

        await whatsappService.conectar();

        res.json({
            success: true,
            message: "Conectando..."
        });

    } catch (erro) {

        console.error(erro);

        res.status(500).json({
            success: false,
            message: "Erro ao conectar."
        });

    }

});

// Solicita desconexão
router.post("/disconnect", async (req, res) => {

    try {

        await whatsappService.desconectar();

        res.json({
            success: true,
            message: "WhatsApp desconectado."
        });

    } catch (erro) {

        console.error(erro);

        res.status(500).json({
            success: false,
            message: "Erro ao desconectar."
        });

    }

});

export default router;