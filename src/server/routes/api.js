router.get("/status", (req, res) => {

    res.json({
        whatsapp: "Desconectado"
    });

});