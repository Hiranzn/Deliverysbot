const makeWASocket = require("baileys").default;
const {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  Browsers
} = require("baileys");
const P = require("pino");
const QRCode = require("qrcode");
const fs = require("fs").promises;
const path = require("path");
const { handleMessage } = require("../flows/chatFlow");

const maxReconnectAttempts = 5;
const AUTH_BASE_DIR = path.join(process.cwd(), "baileys_auth_info");

const clients = new Map();

function getOrCreateClientState(clientId = "default") {
  if (!clients.has(clientId)) {
    clients.set(clientId, {
      socket: null,
      status: "disconnected",
      qrBase64: null,
      reconnectAttempts: 0,
      lastUpdate: new Date().toISOString()
    });
  }

  return clients.get(clientId);
}

function atualizarStatus(clientId, status) {
  const client = getOrCreateClientState(clientId);
  client.status = status;
  client.lastUpdate = new Date().toISOString();

  if (status === "connected") {
    client.qrBase64 = null;
    client.reconnectAttempts = 0;
  }
}

function enviarQRCodeFrontend(clientId, qrBase64) {
  const client = getOrCreateClientState(clientId);
  client.qrBase64 = qrBase64;
  client.lastUpdate = new Date().toISOString();
}

function getClientAuthDir(clientId) {
  return path.join(AUTH_BASE_DIR, clientId);
}

async function createSocket(clientId = "default") {
  const client = getOrCreateClientState(clientId);

  if (client.socket) {
    return client.socket;
  }

  await fs.mkdir(getClientAuthDir(clientId), { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(getClientAuthDir(clientId));
  const { version } = await fetchLatestBaileysVersion();

  const socket = makeWASocket({
    version,
    auth: state,
    logger: P({ level: "info" }),
    browser: Browsers.ubuntu("Chrome")
  });

  client.socket = socket;
  atualizarStatus(clientId, "connecting");

  socket.ev.on("creds.update", saveCreds);

  socket.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      const qrBase64 = await QRCode.toDataURL(qr);
      enviarQRCodeFrontend(clientId, qrBase64);
      atualizarStatus(clientId, "qr_ready");
    }

    if (connection === "open") {
      atualizarStatus(clientId, "connected");
      console.log(`WhatsApp conectado com sucesso para cliente ${clientId}.`);
      return;
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      const currentClient = getOrCreateClientState(clientId);

      currentClient.socket = null;

      console.log(`Conexão WhatsApp fechada para cliente ${clientId}:`, statusCode);

      if (shouldReconnect && currentClient.reconnectAttempts < maxReconnectAttempts) {
        currentClient.reconnectAttempts += 1;
        atualizarStatus(clientId, "reconnecting");

        const delay = Math.min(3000 * Math.pow(2, currentClient.reconnectAttempts - 1), 30000);
        setTimeout(() => {
          createSocket(clientId).catch((error) => {
            console.error(`Erro ao reconectar cliente ${clientId}:`, error);
          });
        }, delay);
      } else {
        atualizarStatus(clientId, "disconnected");
      }
    }
  });

  socket.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    const promises = messages.map(async (msg) => {
      try {
        const remoteJid = msg.key?.remoteJid || "";

        if (!msg.message) return;
        if (msg.key.fromMe) return;
        if (remoteJid === "status@broadcast" || remoteJid.endsWith("@broadcast")) return;
        if (msg.message.protocolMessage) return;
        if (msg.message?.senderKeyDistributionMessage) return;

        await handleMessage(socket, msg);
      } catch (error) {
        console.error("Erro ao processar mensagem:", error);
      }
    });

    await Promise.all(promises);
  });

  return socket;
}

async function startWhatsApp(clientId = "default") {
  return createSocket(clientId);
}

async function gerarQRCode(clientId = "default") {
  const client = getOrCreateClientState(clientId);

  if (!client.socket) {
    await createSocket(clientId);
  }

  return {
    clientId,
    status: client.status,
    connected: client.status === "connected",
    qrBase64: client.qrBase64,
    lastUpdate: client.lastUpdate
  };
}

function getStatus(clientId = "default") {
  const client = getOrCreateClientState(clientId);

  return {
    clientId,
    status: client.status,
    connected: client.status === "connected",
    qrAvailable: Boolean(client.qrBase64),
    lastUpdate: client.lastUpdate
  };
}

function getSocket(clientId = "default") {
  const client = getOrCreateClientState(clientId);
  return client.socket;
}

async function resetWhatsAppAuth(clientId = "default") {
  const client = getOrCreateClientState(clientId);
  const authDir = getClientAuthDir(clientId);

  if (client.socket) {
    client.socket.end();
    client.socket = null;
  }

  if (await fs.stat(authDir).catch(() => null)) {
    await fs.rm(authDir, { recursive: true, force: true });
  }

  atualizarStatus(clientId, "disconnected");
  client.qrBase64 = null;

  return { message: `Autenticação resetada para cliente ${clientId}.` };
}

async function reconnectWhatsApp(clientId = "default") {
  await resetWhatsAppAuth(clientId);
  await createSocket(clientId);

  return { message: `Reconectando cliente ${clientId}. QR code será gerado em instantes.` };
}

module.exports = {
  startWhatsApp,
  getSocket,
  gerarQRCode,
  enviarQRCodeFrontend,
  atualizarStatus,
  getStatus,
  resetWhatsAppAuth,
  reconnectWhatsApp
};
