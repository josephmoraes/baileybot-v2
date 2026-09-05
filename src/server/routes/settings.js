import { Router } from "express";
import settingsService from "../../services/settingsService.js";
import commissionService from "../../services/commissionService.js";

const router = Router();

router.get("/", (req, res) => {
    res.json(settingsService.obter());
});

router.put("/bot", (req, res) => {
    try {
        res.json(settingsService.salvarBot(req.body));
    } catch (erro) {
        res.status(400).json({ error: erro.message });
    }
});

router.post("/commission-rate/preview", (req, res) => {
    try { res.json(commissionService.preverAlteracaoTaxaPadrao(req.body.rate)); }
    catch (erro) { res.status(400).json({ error: erro.message }); }
});

router.put("/commission-rate", (req, res) => {
    try { res.json(commissionService.alterarTaxaPadrao(req.body.rate)); }
    catch (erro) { res.status(400).json({ error: erro.message }); }
});

router.post("/commission-closing-period/preview", (req, res) => {
    try { res.json(commissionService.preverAlteracaoPeriodoFechamento(req.body)); }
    catch (erro) { res.status(400).json({ error: erro.message }); }
});

router.put("/commission-closing-period", (req, res) => {
    try { res.json(commissionService.alterarPeriodoFechamento(req.body)); }
    catch (erro) { res.status(400).json({ error: erro.message }); }
});

router.get("/blocked", (req, res) => res.json(settingsService.listarBloqueados()));
router.post("/blocked", (req, res) => {
    try { res.status(201).json(settingsService.bloquear(req.body.telefone, req.body.motivo)); }
    catch (erro) { res.status(400).json({ error: erro.message }); }
});
router.delete("/blocked/:id", (req, res) => res.json(settingsService.desbloquear(req.params.id)));

router.post("/backup", async (req, res) => {
    try {
        const arquivo = await settingsService.criarBackup();
        res.download(arquivo, "baileybot-backup.db");
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ error: "Não foi possível criar o backup." });
    }
});

export default router;
