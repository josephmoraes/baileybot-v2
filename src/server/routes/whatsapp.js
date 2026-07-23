import express from "express";

const router = express.Router();

// Status da conexão
router.get("/status", (req, res) => {

    res.json({
        status: "Desconectado"
    });

});

// Solicita conexão
router.post("/connect", (req, res) => {

    console.log("Conectar WhatsApp");

    res.json({
        success: true,
        message: "Solicitação recebida."
    });

});

// Solicita desconexão
router.post("/disconnect", (req, res) => {

    console.log("Desconectar WhatsApp");

    res.json({
        success: true,
        message: "Desconectado."
    });

});

export default router;