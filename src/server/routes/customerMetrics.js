import express from "express";
import customerMetricsService from "../../services/customerMetricsService.js";

const router = express.Router();
const respond = handler => async (req, res) => {
    try { res.json(await handler(req, res)); }
    catch (error) { res.status(/não encontrad/i.test(error.message) ? 404 : 400).json({ error: error.message }); }
};

router.get("/imports", respond(() => customerMetricsService.imports()));
router.post("/imports/preview", respond(req => customerMetricsService.preview(req.body)));
router.post("/imports", respond(req => customerMetricsService.import(req.body)));
router.get("/dashboard", respond(req => customerMetricsService.dashboard(req.query)));
router.get("/status-options/:scope", respond(req => customerMetricsService.statusOptions(req.params.scope)));
router.post("/status-options", respond(req => customerMetricsService.createStatus(req.body)));
router.delete("/status-options/:id", respond(req => customerMetricsService.deleteStatus(req.params.id)));
router.get("/clients/:id", respond(req => customerMetricsService.customer(req.params.id)));
router.put("/clients/:id", respond(req => customerMetricsService.updateCustomer(req.params.id, req.body)));
router.put("/clients/:id/products", respond(req => customerMetricsService.updateCustomer(req.params.id, req.body)));

export default router;
