const makeWASocket = require("baileys").default;
const {
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers
} = require("baileys");
const P = require("pino");
const QRCode = require("qrcode");
const { handleMessage } = require("../flows/chatFlow");
const {
  loadSession,
  saveSession,
  deleteSession
} = require("./whatsappSessionStore");

const maxReconnectAttempts = 5;
const QR_EXPIRY_MS = 60 * 1000;

const clients = new Map();

function normalizeCompanyId(companyId = "default") {
  return String(companyId || "default");
}

function getOrCreateClientState(companyId = "default") {
  const normalizedCompanyId = normalizeCompanyId(companyId);

  if (!clients.has(normalizedCompanyId)) {
    clients.set(normalizedCompanyId, {
      socket: null,
      status: "disconnected",
      qrBase64: null,
      qrGeneratedAt: null,
      reconnectAttempts: 0,
      lastUpdate: new Date().toISOString(),
      session: null
    });
  }

  return clients.get(normalizedCompanyId);
}

async function atualizarStatus(companyId, status) {
  const normalizedCompanyId = normalizeCompanyId(companyId);
  const client = getOrCreateClientState(normalizedCompanyId);

  client.status = status;
  client.lastUpdate = new Date().toISOString();

  if (status === "connected") {
    client.qrBase64 = null;
    client.qrGeneratedAt = null;
    client.reconnectAttempts = 0;
  }

  if (client.session) {
    await saveSession(normalizedCompanyId, client.session, status);
  }
}

function enviarQRCodeFrontend(companyId, qrBase64) {
  const client = getOrCreateClientState(companyId);
  client.qrBase64 = qrBase64;
  client.qrGeneratedAt = Date.now();
  client.lastUpdate = new Date().toISOString();
}

function isQrExpired(client) {
  if (!client.qrGeneratedAt) return true;
  return Date.now() - client.qrGeneratedAt > QR_EXPIRY_MS;
}

function buildAuthState(companyId, client) {
  return {
    creds: client.session.creds,
    keys: {
      get: async (type, ids) => {
        const keyTypeData = client.session.keys?.[type] || {};
        const data = {};

        for (const id of ids) {
          if (keyTypeData[id]) {
            data[id] = keyTypeData[id];
          }
        }

        return data;
      },
      set: async (data) => {
        for (const type of Object.keys(data)) {
          client.session.keys[type] = client.session.keys[type] || {};

          for (const id of Object.keys(data[type])) {
            const value = data[type][id];

            if (value) {
              client.session.keys[type][id] = value;
            } else {
              delete client.session.keys[type][id];
            }
          }
        }

        await saveSession(normalizeCompanyId(companyId), client.session, client.status);
      }
    }
  };
}

async function createSocket(companyId = "default") {
  const normalizedCompanyId = normalizeCompanyId(companyId);
  const client = getOrCreateClientState(normalizedCompanyId);

  if (client.socket) {
    return client.socket;
  }

  client.session = await loadSession(normalizedCompanyId);

  const { version } = await fetchLatestBaileysVersion();

  const socket = makeWASocket({
    version,
    auth: buildAuthState(normalizedCompanyId, client),
    logger: P({ level: "info" }),
    browser: Browsers.ubuntu("Chrome")
  });

  client.socket = socket;
  await atualizarStatus(normalizedCompanyId, "connecting");

  socket.ev.on("creds.update", async () => {
    await saveSession(normalizedCompanyId, client.session, client.status);
  });

  socket.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      const qrBase64 = await QRCode.toDataURL(qr);
      enviarQRCodeFrontend(normalizedCompanyId, qrBase64);
      await atualizarStatus(normalizedCompanyId, "qr_ready");
    }

    if (connection === "open") {
      await atualizarStatus(normalizedCompanyId, "connected");
      return;
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      const currentClient = getOrCreateClientState(normalizedCompanyId);

      currentClient.socket = null;

      if (shouldReconnect && currentClient.reconnectAttempts < maxReconnectAttempts) {
        currentClient.reconnectAttempts += 1;
        await atualizarStatus(normalizedCompanyId, "reconnecting");

        const delay = Math.min(3000 * Math.pow(2, currentClient.reconnectAttempts - 1), 30000);
        setTimeout(() => {
          createSocket(normalizedCompanyId).catch((error) => {
            console.error(`Erro ao reconectar cliente ${normalizedCompanyId}:`, error);
          });
        }, delay);
      } else {
        await atualizarStatus(normalizedCompanyId, "disconnected");
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

async function startWhatsApp(companyId = "default") {
  return createSocket(companyId);
}

async function regenerateQRCode(companyId = "default") {
  const normalizedCompanyId = normalizeCompanyId(companyId);
  const client = getOrCreateClientState(normalizedCompanyId);

  if (client.socket) {
    client.socket.end();
    client.socket = null;
  }

  client.qrBase64 = null;
  client.qrGeneratedAt = null;

  await createSocket(normalizedCompanyId);

  return getOrCreateClientState(normalizedCompanyId);
}

async function gerarQRCode(companyId = "default") {
  const normalizedCompanyId = normalizeCompanyId(companyId);
  let client = getOrCreateClientState(normalizedCompanyId);

  if (!client.socket) {
    await createSocket(normalizedCompanyId);
    client = getOrCreateClientState(normalizedCompanyId);
  }

  if (client.status !== "connected" && client.qrBase64 && isQrExpired(client)) {
    client = await regenerateQRCode(normalizedCompanyId);
  }

  return {
    companyId: normalizedCompanyId,
    status: client.status,
    connected: client.status === "connected",
    qrBase64: client.qrBase64,
    qrExpiresAt: client.qrGeneratedAt ? new Date(client.qrGeneratedAt + QR_EXPIRY_MS).toISOString() : null,
    lastUpdate: client.lastUpdate
  };
}

function getStatus(companyId = "default") {
  const normalizedCompanyId = normalizeCompanyId(companyId);
  const client = getOrCreateClientState(normalizedCompanyId);

  return {
    companyId: normalizedCompanyId,
    status: client.status,
    connected: client.status === "connected",
    qrAvailable: Boolean(client.qrBase64),
    qrExpired: client.qrBase64 ? isQrExpired(client) : false,
    lastUpdate: client.lastUpdate
  };
}

function getSocket(companyId = "default") {
  const client = getOrCreateClientState(companyId);
  return client.socket;
}

async function resetWhatsAppAuth(companyId = "default") {
  const normalizedCompanyId = normalizeCompanyId(companyId);
  const client = getOrCreateClientState(normalizedCompanyId);

  if (client.socket) {
    client.socket.end();
    client.socket = null;
  }

  await deleteSession(normalizedCompanyId);

  client.session = null;
  client.qrBase64 = null;
  client.qrGeneratedAt = null;
  await atualizarStatus(normalizedCompanyId, "disconnected");

  return { message: `Autenticação resetada para empresa ${normalizedCompanyId}.` };
}

async function reconnectWhatsApp(companyId = "default") {
  const normalizedCompanyId = normalizeCompanyId(companyId);
  await resetWhatsAppAuth(normalizedCompanyId);
  await createSocket(normalizedCompanyId);

  return { message: `Reconectando empresa ${normalizedCompanyId}. QR code será gerado em instantes.` };
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
