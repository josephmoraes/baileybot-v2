import makeWASocket, {
    DisconnectReason,
    useMultiFileAuthState,
    fetchLatestBaileysVersion   // adicionar isso
} from "@whiskeysockets/baileys";

import pino from "pino";
import QRCode from "qrcode";
import fs from "fs";

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

    console.log("Diretório atual:", process.cwd());
    console.log("Auth existe?", fs.existsSync("auth_info"));

    if (this.isConnecting || this.sock) {
        return;
    }

    this.isConnecting = true;
    this.status = "connecting";

    try {

        const { state, saveCreds } =
            await useMultiFileAuthState("auth_info");

        const { version } = await fetchLatestBaileysVersion(); // adicionar

        this.sock = makeWASocket({
            version,              // adicionar
            auth: state,
            logger: pino({ level: "silent" })
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

                    const codigo =
                        lastDisconnect?.error?.output?.statusCode;


                    if (this.manualDisconnect) {

                        console.log("Sessão encerrada pelo usuário.");

                        this.manualDisconnect = false;

                        this.sock = null;
                        this.qrCode = null;
                        this.status = "disconnected";

                        return;

                    }


                    console.log("WhatsApp desconectado.");
                    console.log("Código:", codigo);
                    console.log(lastDisconnect);

                    this.sock = null;
                    this.qrCode = null;


                    const reconectar =
                        codigo !== DisconnectReason.loggedOut &&
                        !this.manualDisconnect;

                    if (reconectar) {

                        console.log("Tentando reconectar...");

                        this.status = "connecting";

                        setTimeout(() => this.conectar(), 3000);

                    } else {

                        console.log("Sessão encerrada.");

                        this.status = "disconnected";

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

    async enviarMensagem(jid, mensagem) {

        console.log("JID recebido:", jid);
        console.log("Tipo:", typeof jid);

        if (!this.sock) {
            throw new Error("WhatsApp não está conectado.");
        }

        if (!jid || !jid.includes("@s.whatsapp.net")) {
            throw new Error(
                "JID inválido. Cliente não possui WhatsApp configurado corretamente."
            );
        }

        await this.sock.sendMessage(
            jid,
            {
                text: mensagem
            }
        );

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