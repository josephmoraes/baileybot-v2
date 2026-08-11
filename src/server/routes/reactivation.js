import express from "express";
import reactivationService from "../../services/reactivationService.js";

const router = express.Router();
const responder = funcao => (req, res) => { try { res.json(funcao(req, res)); } catch (erro) { res.status(/não encontrado/i.test(erro.message) ? 404 : 400).json({ error: erro.message }); } };

router.get("/dashboard", responder(() => reactivationService.dashboard()));
router.get("/clients", responder(req => reactivationService.listar(req.query)));
router.get("/clients/:id", responder(req => reactivationService.obter(req.params.id) || (() => { throw new Error("Cliente não encontrado."); })()));
router.post("/clients", responder(req => reactivationService.salvar(null, req.body)));
router.put("/clients/:id", responder(req => reactivationService.salvar(req.params.id, req.body)));
router.patch("/clients/:id/status", responder(req => reactivationService.atualizarStatus(req.params.id, req.body.status)));
router.post("/clients/:id/contacts", responder(req => reactivationService.registrarContato(req.params.id, req.body)));
router.get("/tags", responder(() => reactivationService.listarTags()));
router.post("/tags", responder(req => reactivationService.criarTag(req.body)));
router.get("/reports", responder(() => reactivationService.listarRelatorios()));
router.get("/reports/:id/rows", responder(req => reactivationService.listarLinhasRelatorio(req.params.id, req.query.status)));
router.post("/reports/import", async (req, res) => { try { res.json(await reactivationService.importarRelatorio(req.body)); } catch (erro) { res.status(400).json({ error: erro.message }); } });
router.put("/report-rows/:id", responder(req => reactivationService.editarLinhaRelatorio(req.params.id, req.body)));
router.delete("/report-rows/:id", responder(req => reactivationService.excluirLinhaRelatorio(req.params.id)));
router.post("/report-rows/:id/approve", responder(req => reactivationService.aprovarLinhaRelatorio(req.params.id, req.body)));
router.post("/imports/preview", async (req, res) => { try { res.json(await reactivationService.preverImportacao(req.body)); } catch (erro) { res.status(400).json({ error: erro.message }); } });
router.post("/imports", async (req, res) => { try { res.json(await reactivationService.importar(req.body)); } catch (erro) { res.status(400).json({ error: erro.message }); } });

export default router;
