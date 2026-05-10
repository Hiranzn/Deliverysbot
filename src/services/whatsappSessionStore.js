const { BufferJSON, initAuthCreds } = require("baileys");
const crypto = require("crypto");
const fs = require("fs").promises;
const path = require("path");
const pool = require("../config/db");
const { normalizeStoreScopeId } = require("../utils/tenantScope");
const { ensureTenantModel } = require("./tenantModelService");

let dbAvailable = true;

const FALLBACK_DIR = path.join(process.cwd(), "whatsapp_sessions");

function getEncryptionSecret() {
  const secret = process.env.SESSION_ENCRYPTION_KEY || process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("SESSION_ENCRYPTION_KEY ou JWT_SECRET é obrigatório para criptografar sessões");
  }

  return crypto.createHash("sha256").update(String(secret)).digest();
}

function encryptJsonPayload(value) {
  const key = getEncryptionSecret();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = JSON.stringify(value);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    encrypted: true,
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64")
  };
}

function decryptJsonPayload(value) {
  if (!value || value.encrypted !== true) {
    return value;
  }

  const key = getEncryptionSecret();
  const decipher = crypto.createDecipheriv(
    value.algorithm || "aes-256-gcm",
    key,
    Buffer.from(value.iv, "base64")
  );

  decipher.setAuthTag(Buffer.from(value.tag, "base64"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(value.data, "base64")),
    decipher.final()
  ]);

  return JSON.parse(decrypted.toString("utf8"));
}

function serialize(value) {
  return JSON.parse(JSON.stringify(value, BufferJSON.replacer));
}

function deserialize(value) {
  if (!value) return value;
  return JSON.parse(JSON.stringify(value), BufferJSON.reviver);
}

function normalizeSessionKey(storeId) {
  return String(normalizeStoreScopeId(storeId, "default"));
}

function getFallbackFilePath(storeId) {
  const sessionKey = normalizeSessionKey(storeId).replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(FALLBACK_DIR, `${sessionKey}.json`);
}

function getEmptySession() {
  return {
    status: "disconnected",
    creds: initAuthCreds(),
    keys: {}
  };
}

function mapStoredSession(storedStatus, storedPayload) {
  const payload = decryptJsonPayload(storedPayload) || {};

  return {
    status: storedStatus || "disconnected",
    creds: deserialize(payload.creds) || initAuthCreds(),
    keys: deserialize(payload.keys) || {}
  };
}

async function loadSessionFromFile(storeId) {
  await fs.mkdir(FALLBACK_DIR, { recursive: true });

  const filePath = getFallbackFilePath(storeId);
  const file = await fs.readFile(filePath, "utf8").catch(() => null);

  if (!file) {
    return getEmptySession();
  }

  const parsed = JSON.parse(file);

  return mapStoredSession(
    parsed.status,
    parsed.sessionData || parsed.encryptedSessionData || null
  );
}

async function saveSessionToFile(storeId, session, status = "disconnected") {
  await fs.mkdir(FALLBACK_DIR, { recursive: true });
  const sessionKey = normalizeSessionKey(storeId);
  const filePath = getFallbackFilePath(sessionKey);

  await fs.writeFile(
    filePath,
    JSON.stringify({
      storeId: sessionKey,
      sessionKey,
      status,
      sessionData: encryptJsonPayload({
        creds: serialize(session.creds),
        keys: serialize(session.keys || {})
      }),
      updatedAt: new Date().toISOString()
    })
  );
}

function toNumericStoreId(storeId) {
  const parsed = Number.parseInt(normalizeSessionKey(storeId), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

async function loadSession(storeId) {
  await ensureTenantModel();

  const sessionKey = normalizeSessionKey(storeId);

  if (!dbAvailable) {
    return loadSessionFromFile(sessionKey);
  }

  const result = await pool.query(
    `
    SELECT status, session_data
    FROM whatsapp_sessions
    WHERE session_key = $1
    LIMIT 1
    `,
    [sessionKey]
  ).catch(async (error) => {
    dbAvailable = false;
    console.warn("Falha ao carregar sessão no banco. Usando fallback em arquivo.", error.code || error.message);
    return null;
  });

  if (!result) {
    return loadSessionFromFile(sessionKey);
  }

  if (result.rowCount === 0) {
    return getEmptySession();
  }

  const row = result.rows[0];
  return mapStoredSession(row.status, row.session_data);
}

async function loadPersistedSessionStatus(storeId) {
  const session = await loadSession(storeId);
  return session.status || "disconnected";
}

async function saveSession(storeId, session, status = "disconnected") {
  await ensureTenantModel();

  const sessionKey = normalizeSessionKey(storeId);
  const numericStoreId = toNumericStoreId(storeId);

  if (!dbAvailable) {
    await saveSessionToFile(sessionKey, session, status);
    return;
  }

  await pool.query(
    `
    INSERT INTO whatsapp_sessions (store_id, session_key, status, session_data, updated_at)
    VALUES ($1, $2, $3, $4::jsonb, NOW())
    ON CONFLICT (session_key)
    DO UPDATE SET
      store_id = EXCLUDED.store_id,
      status = EXCLUDED.status,
      session_data = EXCLUDED.session_data,
      updated_at = NOW()
    `,
    [
      numericStoreId,
      sessionKey,
      status,
      JSON.stringify(
        encryptJsonPayload({
          creds: serialize(session.creds),
          keys: serialize(session.keys || {})
        })
      )
    ]
  ).catch(async (error) => {
    dbAvailable = false;
    console.warn("Falha ao salvar sessão no banco. Usando fallback em arquivo.", error.code || error.message);
    await saveSessionToFile(sessionKey, session, status);
  });
}

async function deleteSession(storeId) {
  await ensureTenantModel();

  const sessionKey = normalizeSessionKey(storeId);

  if (dbAvailable) {
    await pool.query(`DELETE FROM whatsapp_sessions WHERE session_key = $1`, [sessionKey]).catch(() => null);
  }

  const filePath = getFallbackFilePath(sessionKey);
  await fs.rm(filePath, { force: true }).catch(() => null);
}

module.exports = {
  loadSession,
  loadPersistedSessionStatus,
  saveSession,
  deleteSession,
  ensureMultiTenantTables: ensureTenantModel
};
