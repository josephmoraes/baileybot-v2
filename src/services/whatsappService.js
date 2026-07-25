import makeWASocket from "@whiskeysockets/baileys";

class WhatsAppService {

    constructor() {
        this.sock = null;
        this.status = "disconnected";
    }

    async conectar() {
        this.status = "connecting";

        // Implementar futuramente
    }

    getSocket() {
        return this.sock;
    }

    getStatus() {
        return this.status;
    }

    setStatus(status) {
        this.status = status;
    }

}

export default new WhatsAppService();