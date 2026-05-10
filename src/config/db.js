const { Pool } = require("pg");
require("dotenv").config();

function isProductionLikeEnvironment() {
  return process.env.NODE_ENV === "production" || Boolean(process.env.RAILWAY_ENVIRONMENT);
}

function buildSslConfig() {
  const sslMode = String(process.env.DB_SSL_MODE || "").trim().toLowerCase();

  if (sslMode === "disable") {
    return false;
  }

  if (sslMode === "require") {
    return { rejectUnauthorized: false };
  }

  if (process.env.DATABASE_URL && isProductionLikeEnvironment()) {
    return { rejectUnauthorized: false };
  }

  return false;
}

function buildPoolConfig() {
  const ssl = buildSslConfig();

  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl
    };
  }

  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl
  };
}

const pool = new Pool(buildPoolConfig());

module.exports = pool;
