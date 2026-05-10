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
  loadPersistedSessionStatus,
  saveSession,
  deleteSession
} = require("./whatsappSessionStore");
const { normalizeStoreScopeId } = require("../utils/tenantScope");

const maxReconnectAttempts = 5;
const QR_EXPIRY_MS = 60 * 1000;

const clients = new Map();

function normalizeStoreId(storeId = "default") {
  return normalizeStoreScopeId(storeId, "default");
}

function getOrCreateClientState(storeId = "default") {
  const normalizedStoreId = normalizeStoreId(storeId);

  if (!clients.has(normalizedStoreId)) {
    clients.set(normalizedStoreId, {
      socket: null,
      status: "disconnected",
      qrBase64: null,
      qrGeneratedAt: null,
      reconnectAttempts: 0,
      lastUpdate: new Date().toISOString(),
      session: null
    });
  }

  return clients.get(normalizedStoreId);
}

async function hydrateClientStatus(storeId = "default") {
  const normalizedStoreId = normalizeStoreId(storeId);
  const client = getOrCreateClientState(normalizedStoreId);

  if (client.socket || client.session || client.status !== "disconnected") {
    return client;
  }

  try {
    const persistedStatus = await loadPersistedSessionStatus(normalizedStoreId);
    client.status = persistedStatus || "disconnected";
    client.lastUpdate = new Date().toISOString();
  } catch (error) {
    client.status = "disconnected";
  }

  return client;
}

async function atualizarStatus(storeId, status) {
  const normalizedStoreId = normalizeStoreId(storeId);
  const client = getOrCreateClientState(normalizedStoreId);

  client.status = status;
  client.lastUpdate = new Date().toISOString();

  if (status === "connected") {
    client.qrBase64 = null;
    client.qrGeneratedAt = null;
    client.reconnectAttempts = 0;
  }

  if (client.session) {
    await saveSession(normalizedStoreId, client.session, status);
  }
}

function enviarQRCodeFrontend(storeId, qrBase64) {
  const client = getOrCreateClientState(storeId);
  client.qrBase64 = qrBase64;
  client.qrGeneratedAt = Date.now();
  client.lastUpdate = new Date().toISOString();
}

function isQrExpired(client) {
  if (!client.qrGeneratedAt) return true;
  return Date.now() - client.qrGeneratedAt > QR_EXPIRY_MS;
}

function buildAuthState(storeId, client) {
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

        await saveSession(normalizeStoreId(storeId), client.session, client.status);
      }
    }
  };
}

async function createSocket(storeId = "default") {
  const normalizedStoreId = normalizeStoreId(storeId);
  const client = getOrCreateClientState(normalizedStoreId);

  if (client.socket) {
    return client.socket;
  }

  client.session = await loadSession(normalizedStoreId);
  client.status = client.session.status || client.status;
  client.lastUpdate = new Date().toISOString();

  const { version } = await fetchLatestBaileysVersion();

  const socket = makeWASocket({
    version,
    auth: buildAuthState(normalizedStoreId, client),
    logger: P({ level: "info" }),
    browser: Browsers.ubuntu("Chrome")
  });

  client.socket = socket;
  if (client.status !== "connected") {
    await atualizarStatus(normalizedStoreId, "connecting");
  }

  socket.ev.on("creds.update", async () => {
    await saveSession(normalizedStoreId, client.session, client.status);
  });

  socket.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      const qrBase64 = await QRCode.toDataURL(qr);
      enviarQRCodeFrontend(normalizedStoreId, qrBase64);
      await atualizarStatus(normalizedStoreId, "qr_ready");
    }

    if (connection === "open") {
      await atualizarStatus(normalizedStoreId, "connected");
      return;
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      const currentClient = getOrCreateClientState(normalizedStoreId);

      currentClient.socket = null;

      if (shouldReconnect && currentClient.reconnectAttempts < maxReconnectAttempts) {
        currentClient.reconnectAttempts += 1;
        await atualizarStatus(normalizedStoreId, "reconnecting");

        const delay = Math.min(3000 * Math.pow(2, currentClient.reconnectAttempts - 1), 30000);
        setTimeout(() => {
          createSocket(normalizedStoreId).catch((error) => {
            console.error(`Erro ao reconectar loja ${normalizedStoreId}:`, error);
          });
        }, delay);
      } else {
        await atualizarStatus(normalizedStoreId, "disconnected");
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

        await handleMessage(socket, msg, { storeId: normalizedStoreId });
      } catch (error) {
        console.error("Erro ao processar mensagem:", error);
      }
    });

    await Promise.all(promises);
  });

  return socket;
}

async function startWhatsApp(storeId = "default") {
  return createSocket(storeId);
}

async function regenerateQRCode(storeId = "default") {
  const normalizedStoreId = normalizeStoreId(storeId);
  const client = getOrCreateClientState(normalizedStoreId);

  if (client.socket) {
    client.socket.end();
    client.socket = null;
  }

  client.qrBase64 = null;
  client.qrGeneratedAt = null;

  await createSocket(normalizedStoreId);

  return getOrCreateClientState(normalizedStoreId);
}

function buildStatusPayload(storeId, client) {
  return {
    storeId,
    companyId: storeId,
    restaurantId: storeId,
    status: client.status,
    connected: client.status === "connected",
    qrBase64: client.qrBase64,
    qrExpiresAt: client.qrGeneratedAt ? new Date(client.qrGeneratedAt + QR_EXPIRY_MS).toISOString() : null,
    lastUpdate: client.lastUpdate
  };
}

async function gerarQRCode(storeId = "default") {
  const normalizedStoreId = normalizeStoreId(storeId);
  let client = getOrCreateClientState(normalizedStoreId);

  if (!client.socket) {
    await createSocket(normalizedStoreId);
    client = getOrCreateClientState(normalizedStoreId);
  }

  if (client.status !== "connected" && client.qrBase64 && isQrExpired(client)) {
    client = await regenerateQRCode(normalizedStoreId);
  }

  return buildStatusPayload(normalizedStoreId, client);
}

async function getStatus(storeId = "default") {
  const normalizedStoreId = normalizeStoreId(storeId);
  const client = await hydrateClientStatus(normalizedStoreId);

  return {
    ...buildStatusPayload(normalizedStoreId, client),
    qrAvailable: Boolean(client.qrBase64),
    qrExpired: client.qrBase64 ? isQrExpired(client) : false
  };
}

function getSocket(storeId = "default") {
  const client = getOrCreateClientState(storeId);
  return client.socket;
}

async function resetWhatsAppAuth(storeId = "default") {
  const normalizedStoreId = normalizeStoreId(storeId);
  const client = getOrCreateClientState(normalizedStoreId);

  if (client.socket) {
    client.socket.end();
    client.socket = null;
  }

  await deleteSession(normalizedStoreId);

  client.session = null;
  client.qrBase64 = null;
  client.qrGeneratedAt = null;
  await atualizarStatus(normalizedStoreId, "disconnected");

  return { message: `Autenticação resetada para loja ${normalizedStoreId}.` };
}

async function reconnectWhatsApp(storeId = "default") {
  const normalizedStoreId = normalizeStoreId(storeId);
  await resetWhatsAppAuth(normalizedStoreId);
  await createSocket(normalizedStoreId);

  return { message: `Reconectando loja ${normalizedStoreId}. QR code será gerado em instantes.` };
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
