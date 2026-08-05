import dashboardRepository from "../repositories/dashboardRepository.js";
import settingsService from "../services/settingsService.js";
import whatsappService from "../services/whatsappService.js";

const formatarData = valor => {
    if (!valor) return "Agora";
    return new Intl.DateTimeFormat("pt-BR", {
        hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit"
    }).format(new Date(`${valor.replace(" ", "T")}Z`));
};

export function obterDashboard(req, res, next) {
    try {
        const indicadores = dashboardRepository.obterIndicadores();
        const limiteDiario = settingsService.obterBot().limiteDiario;
        const whatsappStatus = whatsappService.getStatus();
        const graficoMensagens = dashboardRepository.listarMensagensSemana().map(item => ({
            ...item,
            dia: new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "UTC" })
                .format(new Date(`${item.data}T12:00:00Z`)).replace(".", "")
        }));
        const atividades = dashboardRepository.listarAtividades().map(item => ({
            ...item,
            quando: formatarData(item.data),
            icone: item.tipo === "mensagem" ? "bi-chat-dots" : item.tipo === "campanha" ? "bi-megaphone" : "bi-person-plus",
            cor: item.tipo === "mensagem" ? "success" : item.tipo === "campanha" ? "warning" : "primary"
        }));
        const avisos = [];
        if (whatsappStatus !== "connected") avisos.push({ texto: "WhatsApp desconectado. Os envios estão indisponíveis.", icone: "bi-wifi-off" });
        if (indicadores.errosHoje) avisos.push({ texto: `${indicadores.errosHoje} mensagem(ns) com erro hoje.`, icone: "bi-exclamation-circle" });
        if (indicadores.campanhasComErro) avisos.push({ texto: `${indicadores.campanhasComErro} campanha(s) precisam de revisão.`, icone: "bi-megaphone" });
        const percentual = limiteDiario ? Math.min(Math.round((indicadores.mensagensHoje / limiteDiario) * 100), 100) : 0;

        res.json({
            kpis: indicadores,
            whatsapp: { status: whatsappStatus },
            meta: { atual: indicadores.mensagensHoje, limite: limiteDiario, percentual, restante: Math.max(limiteDiario - indicadores.mensagensHoje, 0) },
            graficoMensagens,
            mensagensSemana: graficoMensagens.reduce((soma, item) => soma + item.total, 0),
            atividades,
            campanhas: dashboardRepository.listarCampanhasRecentes(),
            ultimosEnvios: dashboardRepository.listarEnviosRecentes(),
            avisos,
            atualizadoEm: new Date().toISOString()
        });
    } catch (erro) {
        next(erro);
    }
}
