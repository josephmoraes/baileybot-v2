import makeWASocket, {
    DisconnectReason,
    useMultiFileAuthState,
    fetchLatestBaileysVersion   // adicionar isso
} from "@whiskeysockets/baileys";

import pino from "pino";
import QRCode from "qrcode";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authPath = process.env.AUTH_PATH
    ? path.resolve(process.env.AUTH_PATH)
    : path.resolve(__dirname, "../../auth_info");

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

    console.log("Sessão do WhatsApp:", fs.existsSync(authPath) ? "encontrada" : "nova");

    if (this.isConnecting || this.sock) {
        return;
    }

    this.manualDisconnect = false;

    this.isConnecting = true;
    this.status = "connecting";

    try {

        const { state, saveCreds } =
            await useMultiFileAuthState(authPath);

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
            throw erro;

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
            if (fs.existsSync(authPath)) {
                fs.rmSync(authPath, { recursive: true, force: true });
            }

        }

    }

    async verificarNumero(jidOuNumero) {
        if (
            !this.sock ||
            this.status !== "connected"
        ) {
            throw new Error(
                "WhatsApp não está conectado."
            );
        }

        const numero = String(jidOuNumero || "")
            .replace("@s.whatsapp.net", "")
            .replace(/\D/g, "");

        if (numero.length < 10 || numero.length > 13) {
            throw new Error(
                "O cliente não possui um telefone válido."
            );
        }

        const verificacao =
            await this.sock.onWhatsApp(numero);

        const contato = verificacao?.find(
            resultado => resultado.exists
        );

        if (!contato) {
            return {
                exists: false,
                jid: null
            };
        }

        return {
            exists: true,
            jid: contato.jid
        };
    }

    async enviarMensagem(jid, mensagem) {
        const contato = await this.verificarNumero(jid);

        if (!contato.exists) {
            throw new Error(
                "Este número não foi encontrado no WhatsApp."
            );
        }

        const resultado =
            await this.sock.sendMessage(
                contato.jid,
                {
                    text: mensagem
                }
            );

        if (!resultado?.key?.id) {
            throw new Error(
                "O WhatsApp não confirmou o envio da mensagem."
            );
        }

        console.log(
            "Mensagem aceita pelo WhatsApp:",
            {
                jid: contato.jid,
                messageId: resultado.key.id
            }
        );

        return {
            jid: contato.jid,
            messageId: resultado.key.id
        };
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
