import express from "express";
import reportsService from "../../services/reportsService.js";

const router = express.Router();
router.get("/sellers", (req, res) => res.json(reportsService.sellers()));
router.get("/:type", (req, res) => { try { res.json(reportsService.data(req.params.type, req.query)); } catch (error) { res.status(400).json({ error: error.message }); } });
router.get("/:type/pdf", async (req, res) => { try { const pdf = await reportsService.pdf(req.params.type, req.query); res.type("application/pdf").attachment(`relatorio-${req.params.type}.pdf`).send(pdf); } catch (error) { res.status(400).json({ error: error.message }); } });
export default router;
