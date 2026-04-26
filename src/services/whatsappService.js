const makeWASocket = require("baileys").default;
const {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  Browsers
} = require("baileys");
const P = require("pino");
const QRCode = require ("qrcode");
const fs = require("fs").promises;
const path = require("path");
const ordersService = require("./ordersService");
const {handleMessage} = require("../flows/chatFlow");

let reconnectAttempts = 0;
const maxReconnectAttempts = 5;
let sock = null;

async function startWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState("baileys_auth_info");
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger: P({ level: "info" }),
    browser: Browsers.ubuntu("Chrome")
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      //console.clear();
      console.log("Escaneie o QR Code com o WhatsApp: \n");
      console.log(await QRCode.toString(qr, {type: "terminal", small:true}));
    }

    if (connection === "open") {
      console.log("WhatsApp conectado com sucesso.");
      reconnectAttempts = 0; // Reset on successful connection
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      console.log("Conexão WhatsApp fechada:", statusCode);

      if (shouldReconnect && reconnectAttempts < maxReconnectAttempts) {
        reconnectAttempts++;
        const delay = Math.min(3000 * Math.pow(2, reconnectAttempts - 1), 30000); // Exponential backoff, max 30s
        console.log(`Reconectando em ${delay / 1000} segundos... (Tentativa ${reconnectAttempts}/${maxReconnectAttempts})`);
        setTimeout(() => startWhatsApp(), delay);
      } else if (shouldReconnect) {
        console.log("Máximo de tentativas de reconexão atingido. Verifique a conexão.");
      } else {
        console.log("Sessão deslogada. Será necessário conectar novamente.");
        reconnectAttempts = 0;
      }
    }
  });

  console.log("Registrando listener de mensagens...");
    sock.ev.on("messages.upsert", async ({ messages, type }) => {
        console.log("Event type:", type);
        if (type !== "notify") return;

        const promises = messages.map(async (msg) => {
            try {
                const remoteJid = msg.key?.remoteJid || "";

                if (!msg.message) return;
                if (msg.key.fromMe) return;
                if (remoteJid === "status@broadcast" || remoteJid.endsWith("@broadcast")) return;
                if (msg.message.protocolMessage) return;
                if (msg.message?.senderKeyDistributionMessage) return;

                await handleMessage(sock, msg);
            } catch (error) {
                console.error("Erro ao processar mensagem:", error);
            }
        });

        await Promise.all(promises);
    });

  return sock;
}

function getSocket() {
  return sock;
}

async function resetWhatsAppAuth() {
  try {
    const authDir = path.join(process.cwd(), "baileys_auth_info");
    
    if (await fs.stat(authDir).catch(() => null)) {
      await fs.rm(authDir, { recursive: true, force: true });
      console.log("Credenciais do WhatsApp limpas com sucesso.");
    }
    
    if (sock) {
      sock.end();
      sock = null;
      console.log("Socket WhatsApp encerrado.");
    }
    
    return { message: "Autenticação resetada. Inicie o servidor para gerar novo QR code." };
  } catch (error) {
    console.error("Erro ao resetar autenticação:", error);
    throw error;
  }
}

async function reconnectWhatsApp() {
  try {
    await resetWhatsAppAuth();
    
    setTimeout(async () => {
      console.log("Reiniciando WhatsApp...");
      await startWhatsApp();
    }, 1000);
    
    return { message: "Reconectando... QR code aparecerá em breve." };
  } catch (error) {
    console.error("Erro ao reconectar:", error);
    throw error;
  }
}

module.exports = {
  startWhatsApp,
  getSocket,
  resetWhatsAppAuth,
  reconnectWhatsApp
};