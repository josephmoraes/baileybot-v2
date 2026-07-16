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
        delayMin: Number(process.env.DELAY_MIN),
        delayMax: Number(process.env.DELAY_MAX)
    }
};