import { Router } from "express";
import { entrar, sair, statusAutenticacao } from "../../middleware/adminSession.js";

const router = Router();
router.get("/session", statusAutenticacao);
router.post("/login", entrar);
router.post("/logout", sair);

export default router;
