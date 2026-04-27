const { BufferJSON, initAuthCreds } = require("baileys");
const fs = require("fs").promises;
const path = require("path");
const pool = require("../config/db");

let schemaInitialized = false;
let dbAvailable = true;

const FALLBACK_DIR = path.join(process.cwd(), "whatsapp_sessions");

async function ensureMultiTenantTables() {
  if (schemaInitialized || !dbAvailable) return;

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS companies (
        id SERIAL PRIMARY KEY,
        nome TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS company_id INTEGER`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_sessions (
        id SERIAL PRIMARY KEY,
        company_id TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'disconnected',
        session_data JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`ALTER TABLE whatsapp_sessions ADD COLUMN IF NOT EXISTS company_id TEXT`);
    await pool.query(`ALTER TABLE whatsapp_sessions ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'disconnected'`);
    await pool.query(`ALTER TABLE whatsapp_sessions ADD COLUMN IF NOT EXISTS session_data JSONB NOT NULL DEFAULT '{}'::jsonb`);

    schemaInitialized = true;
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

function getFallbackFilePath(companyId) {
  return path.join(FALLBACK_DIR, `${companyId}.json`);
}

async function loadSessionFromFile(companyId) {
  await fs.mkdir(FALLBACK_DIR, { recursive: true });

  const filePath = getFallbackFilePath(companyId);
  const file = await fs.readFile(filePath, "utf8").catch(() => null);

  if (!file) {
    return {
      status: "disconnected",
      creds: initAuthCreds(),
      keys: {}
    };
  }

  const parsed = JSON.parse(file);

  return {
    status: parsed.status || "disconnected",
    creds: deserialize(parsed.sessionData?.creds) || initAuthCreds(),
    keys: deserialize(parsed.sessionData?.keys) || {}
  };
}

async function saveSessionToFile(companyId, session, status = "disconnected") {
  await fs.mkdir(FALLBACK_DIR, { recursive: true });
  const filePath = getFallbackFilePath(companyId);

  await fs.writeFile(
    filePath,
    JSON.stringify({
      companyId,
      status,
      sessionData: {
        creds: serialize(session.creds),
        keys: serialize(session.keys || {})
      },
      updatedAt: new Date().toISOString()
    })
  );
}

async function loadSession(companyId) {
  await ensureMultiTenantTables();

  if (!dbAvailable) {
    return loadSessionFromFile(companyId);
  }

  const result = await pool.query(
    `SELECT status, session_data FROM whatsapp_sessions WHERE company_id = $1 LIMIT 1`,
    [String(companyId)]
  ).catch(async (error) => {
    dbAvailable = false;
    console.warn("Falha ao carregar sessão no banco. Usando fallback em arquivo.", error.code || error.message);
    return null;
  });

  if (!result) {
    return loadSessionFromFile(companyId);
  }

  if (result.rowCount === 0) {
    return {
      status: "disconnected",
      creds: initAuthCreds(),
      keys: {}
    };
  }

  const row = result.rows[0];

  return {
    status: row.status || "disconnected",
    creds: deserialize(row.session_data?.creds) || initAuthCreds(),
    keys: deserialize(row.session_data?.keys) || {}
  };
}

async function saveSession(companyId, session, status = "disconnected") {
  await ensureMultiTenantTables();

  if (!dbAvailable) {
    await saveSessionToFile(companyId, session, status);
    return;
  }

  await pool.query(
    `
      INSERT INTO whatsapp_sessions (company_id, status, session_data, updated_at)
      VALUES ($1, $2, $3::jsonb, NOW())
      ON CONFLICT (company_id)
      DO UPDATE SET
        status = EXCLUDED.status,
        session_data = EXCLUDED.session_data,
        updated_at = NOW()
    `,
    [
      String(companyId),
      status,
      JSON.stringify({
        creds: serialize(session.creds),
        keys: serialize(session.keys || {})
      })
    ]
  ).catch(async (error) => {
    dbAvailable = false;
    console.warn("Falha ao salvar sessão no banco. Usando fallback em arquivo.", error.code || error.message);
    await saveSessionToFile(companyId, session, status);
  });
}

async function deleteSession(companyId) {
  await ensureMultiTenantTables();

  if (dbAvailable) {
    await pool.query(`DELETE FROM whatsapp_sessions WHERE company_id = $1`, [String(companyId)]).catch(() => null);
  }

  const filePath = getFallbackFilePath(companyId);
  await fs.rm(filePath, { force: true }).catch(() => null);
}

module.exports = {
  loadSession,
  saveSession,
  deleteSession,
  ensureMultiTenantTables
};
