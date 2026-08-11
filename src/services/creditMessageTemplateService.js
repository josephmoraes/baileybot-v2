import db from "../database/database.js";

const definitions = [
    {
        key: "credito_gerado",
        name: "Crédito gerado",
        description: "Usada ao notificar os créditos registrados em uma importação.",
        template: "Olá, [Nome]! 👋\nForam registrados novos créditos para você no Programa Técnicos Parceiros da Refricom.\nNesta importação:\n• Novos créditos: [QuantidadeCreditos]\n• Crédito gerado: [Credito]\n• Crédito total atual: [CreditoTotal]\nPara mais informações, entre em contato com a Refricom."
    },
    {
        key: "resumo_creditos",
        name: "Resumo de créditos",
        description: "Usada no envio individual ou em massa do saldo do técnico.",
        template: "Olá, [Nome]! 👋\nEste é o seu resumo atualizado no Programa Técnicos Parceiros da Refricom.\nCrédito total: [CreditoTotal]\nCrédito disponível: [CreditoDisponivel]\nCrédito pendente de liberação: [CreditoPendente]\nEm caso de dúvidas, entre em contato com a Refricom."
    },
    {
        key: "credito_liberado",
        name: "Crédito liberado",
        description: "Modelo disponível para avisar quando um crédito for liberado.",
        template: "Olá, [Nome]! Seu crédito de [Credito] foi liberado em [Data]. Você possui [CreditoDisponivel] créditos disponíveis."
    },
    {
        key: "movimentacao_credito",
        name: "Movimentação ou uso de crédito",
        description: "Modelo disponível para confirmar uma movimentação ou uso de crédito.",
        template: "Olá, [Nome]! Registramos uma movimentação de [Credito] créditos em [Data]. Seu crédito disponível agora é [CreditoDisponivel]."
    }
];

const settingKey = key => `credit_message_template_${key}`;
const formatCredit = value => Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
});
const formatDate = value => {
    if (!value) return new Date().toLocaleDateString("pt-BR");
    const date = new Date(String(value).length === 10 ? `${value}T12:00:00` : value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("pt-BR");
};

class CreditMessageTemplateService {
    list() {
        const select = db.prepare("SELECT value FROM app_settings WHERE key=?");
        return definitions.map(item => ({
            ...item,
            template: select.get(settingKey(item.key))?.value || item.template,
            variables: ["[Nome]", "[Credito]", "[CreditoDisponivel]", "[Data]", "[CreditoTotal]", "[CreditoPendente]", "[QuantidadeCreditos]"]
        }));
    }

    update(key, template) {
        const definition = definitions.find(item => item.key === key);
        if (!definition) throw new Error("Template de crédito não encontrado.");
        if (!template?.trim()) throw new Error("A mensagem é obrigatória.");
        db.prepare(`INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`)
            .run(settingKey(key), template.trim());
        return this.list().find(item => item.key === key);
    }

    render(key, values = {}) {
        const item = this.list().find(template => template.key === key);
        if (!item) throw new Error("Template de crédito não encontrado.");
        const replacements = {
            "[Nome]": values.nome || values.name || "Técnico",
            "[Credito]": formatCredit(values.credito),
            "[CreditoDisponivel]": formatCredit(values.creditoDisponivel),
            "[Data]": formatDate(values.data),
            "[CreditoTotal]": formatCredit(values.creditoTotal),
            "[CreditoPendente]": formatCredit(values.creditoPendente),
            "[QuantidadeCreditos]": String(values.quantidadeCreditos ?? 0)
        };
        return Object.entries(replacements).reduce(
            (message, [variable, value]) => message.replaceAll(variable, value),
            item.template
        );
    }
}

export default new CreditMessageTemplateService();
