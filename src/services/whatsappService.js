import makeWASocket, {
    DisconnectReason,
    useMultiFileAuthState
} from "@whiskeysockets/baileys";

import pino from "pino";
import QRCode from "qrcode";

class WhatsAppService {

    constructor() {

        this.sock = null;
        this.status = "disconnected";
        this.qrCode = null;
        this.isConnecting = false;
        this.saveCreds = null;
        this.manualDisconnect = false;

    }

    async conectar() {

    if (this.isConnecting || this.sock) {
        return;
    }

    this.isConnecting = true;
    this.status = "connecting";

    try {

        const { state, saveCreds } =
            await useMultiFileAuthState("auth_info");

        this.sock = makeWASocket({

            auth: state,

            logger: pino({
                level: "silent"
            })

        });

        this.saveCreds = saveCreds;

        this.sock.ev.on("creds.update", this.saveCreds);

        this.sock.ev.on("connection.update", async (update) => {

            const { connection, lastDisconnect, qr } = update;

                if (qr) {

                    console.log("QR Code recebido.");

                    this.qrCode = await QRCode.toDataURL(qr);

                }

                if (connection === "open") {

                    console.log("WhatsApp conectado.");

                    this.status = "connected";
                    this.qrCode = null;

                }

                if (connection === "close") {

                    if (this.manualDisconnect) {

                        console.log("Desconexão manual.");

                        this.manualDisconnect = false;
                        this.status = "disconnected";

                        return;

                    }

                    console.log("WhatsApp desconectado.");

                    this.sock = null;
                    this.qrCode = null;

                    const codigo =
                        lastDisconnect?.error?.output?.statusCode;

                    if (codigo === DisconnectReason.loggedOut) {

                        console.log("Sessão encerrada pelo usuário.");

                        this.status = "disconnected";

                    } else {

                        console.log("Tentando reconectar...");

                        this.status = "connecting";

                        setTimeout(() => {

                            this.conectar();

                        }, 3000);

                    }

                }

            });

        } catch (erro) {

            console.error("Erro ao iniciar WhatsApp:", erro);

            this.status = "disconnected";
            this.sock = null;

        } finally {

            this.isConnecting = false;

        }

    }

    async desconectar() {

        try {

            this.manualDisconnect = true;

            if (this.sock) {

                await this.sock.logout();
                this.sock.end();

            }

        } catch (erro) {

            console.error("Erro ao desconectar:", erro);

        } finally {

            this.sock = null;
            this.status = "disconnected";
            this.qrCode = null;
            this.isConnecting = false;

        }

    }

    getSocket() {
        return this.sock;
    }

    getStatus() {
        return this.status;
    }

    getQRCode() {
        return this.qrCode;
    }

    limparQRCode() {
        this.qrCode = null;
    }

    setStatus(status) {
        this.status = status;
    }

}

export default new WhatsAppService();