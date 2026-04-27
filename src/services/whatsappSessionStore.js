const { BufferJSON, initAuthCreds } = require("baileys");
const fs = require("fs").promises;
const path = require("path");
const pool = require("../config/db");

let tableInitialized = false;
let dbAvailable = true;

const FALLBACK_DIR = path.join(process.cwd(), "whatsapp_sessions");

async function ensureSessionsTable() {
  if (tableInitialized || !dbAvailable) return;

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_sessions (
        client_id TEXT PRIMARY KEY,
        creds JSONB NOT NULL,
        keys JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    tableInitialized = true;
  } catch (error) {
    dbAvailable = false;
    console.warn("Banco indisponível para sessões WhatsApp. Usando fallback em arquivo.", error.code || error.message);
  }
}

function serialize(value) {
  return JSON.parse(JSON.stringify(value, BufferJSON.replacer));
}

function deserialize(value) {
  if (!value) return value;
  return JSON.parse(JSON.stringify(value), BufferJSON.reviver);
}

function getFallbackFilePath(clientId) {
  return path.join(FALLBACK_DIR, `${clientId}.json`);
}

async function loadSessionFromFile(clientId) {
  await fs.mkdir(FALLBACK_DIR, { recursive: true });

  const filePath = getFallbackFilePath(clientId);
  const file = await fs.readFile(filePath, "utf8").catch(() => null);

  if (!file) {
    return {
      creds: initAuthCreds(),
      keys: {}
    };
  }

  const parsed = JSON.parse(file);

  return {
    creds: deserialize(parsed.creds) || initAuthCreds(),
    keys: deserialize(parsed.keys) || {}
  };
}

async function saveSessionToFile(clientId, session) {
  await fs.mkdir(FALLBACK_DIR, { recursive: true });
  const filePath = getFallbackFilePath(clientId);

  await fs.writeFile(
    filePath,
    JSON.stringify({
      creds: serialize(session.creds),
      keys: serialize(session.keys || {}),
      updatedAt: new Date().toISOString()
    })
  );
}

async function loadSession(clientId) {
  await ensureSessionsTable();

  if (!dbAvailable) {
    return loadSessionFromFile(clientId);
  }

  const result = await pool.query(
    `SELECT creds, keys FROM whatsapp_sessions WHERE client_id = $1 LIMIT 1`,
    [clientId]
  ).catch(async (error) => {
    dbAvailable = false;
    console.warn("Falha ao carregar sessão no banco. Usando fallback em arquivo.", error.code || error.message);
    return null;
  });

  if (!result) {
    return loadSessionFromFile(clientId);
  }

  if (result.rowCount === 0) {
    return {
      creds: initAuthCreds(),
      keys: {}
    };
  }

  const row = result.rows[0];

  return {
    creds: deserialize(row.creds) || initAuthCreds(),
    keys: deserialize(row.keys) || {}
  };
}

async function saveSession(clientId, session) {
  await ensureSessionsTable();

  if (!dbAvailable) {
    await saveSessionToFile(clientId, session);
    return;
  }

  const saved = await pool.query(
    `
      INSERT INTO whatsapp_sessions (client_id, creds, keys, updated_at)
      VALUES ($1, $2::jsonb, $3::jsonb, NOW())
      ON CONFLICT (client_id)
      DO UPDATE SET
        creds = EXCLUDED.creds,
        keys = EXCLUDED.keys,
        updated_at = NOW()
    `,
    [clientId, JSON.stringify(serialize(session.creds)), JSON.stringify(serialize(session.keys || {}))]
  ).catch(async (error) => {
    dbAvailable = false;
    console.warn("Falha ao salvar sessão no banco. Usando fallback em arquivo.", error.code || error.message);
    await saveSessionToFile(clientId, session);
    return null;
  });

  if (!saved) return;
}

async function deleteSession(clientId) {
  await ensureSessionsTable();

  if (dbAvailable) {
    await pool.query(`DELETE FROM whatsapp_sessions WHERE client_id = $1`, [clientId]).catch(() => null);
  }

  const filePath = getFallbackFilePath(clientId);
  await fs.rm(filePath, { force: true }).catch(() => null);
}

module.exports = {
  loadSession,
  saveSession,
  deleteSession
};
