import dotenv from "dotenv";

dotenv.config();

export const config = {
    app: {
        name: process.env.APP_NAME,
        version: process.env.APP_VERSION
    },

    empresa: process.env.EMPRESA,

    whatsapp: {
        countryCode: process.env.COUNTRY_CODE
    },

    envio: {
        delayMinMs: Number(process.env.CAMPAIGN_DELAY_MIN_MS ?? 60000),
        delayMaxMs: Number(process.env.CAMPAIGN_DELAY_MAX_MS ?? 180000)
    }
};
