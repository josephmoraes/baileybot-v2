const makeWASocket = require("@whiskeysockets/baileys").default;

class WhatsAppService {

    constructor() {
        this.sock = null;
    }

    async conectar() {

    }

    getSocket() {
        return this.sock;
    }

}

module.exports = new WhatsAppService();