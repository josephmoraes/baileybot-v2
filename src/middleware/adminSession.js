import crypto from "node:crypto";

const sessions = new Map();
const SESSION_COOKIE = "baileybot_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

const cookies = cabecalho => Object.fromEntries(String(cabecalho || "").split(";").map(item => {
    const indice = item.indexOf("=");
    return indice < 0 ? [item.trim(), ""] : [item.slice(0, indice).trim(), decodeURIComponent(item.slice(indice + 1))];
}));

const senhaCorreta = valor => {
    const esperada = Buffer.from(String(process.env.ADMIN_PASSWORD || ""));
    const recebida = Buffer.from(String(valor || ""));
    return esperada.length === recebida.length && esperada.length > 0 && crypto.timingSafeEqual(esperada, recebida);
};

export function obterSessao(req) {
    const id = cookies(req.headers.cookie)[SESSION_COOKIE];
    const sessao = id ? sessions.get(id) : null;
    if (!sessao || sessao.expiresAt <= Date.now()) {
        if (id) sessions.delete(id);
        return null;
    }
    return { id, ...sessao };
}

export function statusAutenticacao(req, res) {
    const configurada = Boolean(process.env.ADMIN_PASSWORD);
    res.json({ required: configurada, authenticated: !configurada || Boolean(obterSessao(req)) });
}

export function entrar(req, res) {
    if (!process.env.ADMIN_PASSWORD) return res.json({ success: true, required: false });
    if (!senhaCorreta(req.body?.password)) return res.status(401).json({ error: "Senha inválida." });
    const id = crypto.randomBytes(32).toString("hex");
    sessions.set(id, { expiresAt: Date.now() + SESSION_TTL_MS });
    res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`);
    res.json({ success: true, required: true });
}

export function sair(req, res) {
    const sessao = obterSessao(req);
    if (sessao) sessions.delete(sessao.id);
    res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
    res.json({ success: true });
}

export function protegerApi(req, res, next) {
    if (!process.env.ADMIN_PASSWORD || obterSessao(req)) return next();
    res.status(401).json({ error: "Sessão expirada. Entre novamente.", code: "AUTH_REQUIRED" });
}
