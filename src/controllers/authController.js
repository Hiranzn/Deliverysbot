const pool = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

function createHttpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function tableExists(tableName) {
  const result = await pool.query(
    `
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = $1
    ) AS exists
    `,
    [tableName]
  );

  return result.rows[0]?.exists === true;
}

async function ensureUsersTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'user',
      restaurant_id INTEGER NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user'
  `);
}

async function getUsersCount() {
  await ensureUsersTable();

  const result = await pool.query(`SELECT COUNT(*)::INTEGER AS count FROM users`);
  return result.rows[0]?.count ?? 0;
}

async function getMasterUsersCount() {
  await ensureUsersTable();

  const result = await pool.query(
    `SELECT COUNT(*)::INTEGER AS count FROM users WHERE role = 'master'`
  );

  return result.rows[0]?.count ?? 0;
}

async function getDefaultStoreId() {
  const storesExists = await tableExists("stores");

  if (!storesExists) {
    return null;
  }

  const result = await pool.query(`
    SELECT id
    FROM stores
    ORDER BY created_at ASC NULLS LAST, id ASC
    LIMIT 1
  `);

  return result.rows.length > 0 ? result.rows[0].id : null;
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function signToken(userId, restaurantId, role) {
  if (!process.env.JWT_SECRET) {
    throw createHttpError("JWT_SECRET não configurado no ambiente", 500);
  }

  return jwt.sign(
    {
      id: userId,
      restaurantId: restaurantId ?? null,
      role: role || "user"
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "1h"
    }
  );
}

async function getBootstrapStatus(req, res, next) {
  try {
    const usersCount = await getUsersCount();
    const masterUsersCount = await getMasterUsersCount();

    res.status(200).json({
      canRegister: masterUsersCount === 0,
      usersCount,
      masterUsersCount,
      firstUserRole: masterUsersCount === 0 ? "master" : "user"
    });
  } catch (error) {
    next(error);
  }
}

async function register(req, res, next) {
  try {
    await ensureUsersTable();

    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");

    if (!email || !password) {
      throw createHttpError("Email e senha são obrigatórios", 400);
    }

    const existing = await pool.query(
      `SELECT id FROM users WHERE email = $1 LIMIT 1`,
      [email]
    );

    if (existing.rows.length > 0) {
      throw createHttpError("Email já está em uso", 409);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const restaurantId = await getDefaultStoreId();
    const masterUsersCount = await getMasterUsersCount();
    const role = masterUsersCount === 0 ? "master" : "user";

    const result = await pool.query(
      `
      INSERT INTO users (email, password_hash, role, restaurant_id, created_at)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
      RETURNING id, email, role, restaurant_id
      `,
      [email, passwordHash, role, restaurantId]
    );

    res.status(201).json({
      message: "Usuário registrado com sucesso",
      user: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
}

async function login(req, res, next) {
  try {
    await ensureUsersTable();

    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");

    if (!email || !password) {
      throw createHttpError("Email e senha são obrigatórios", 400);
    }

    const result = await pool.query(
      `SELECT id, email, password_hash, role, restaurant_id FROM users WHERE email = $1 LIMIT 1`,
      [email]
    );

    if (result.rows.length === 0) {
      throw createHttpError("Credenciais inválidas", 401);
    }

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);

    if (!match) {
      throw createHttpError("Credenciais inválidas", 401);
    }

    const fallbackStoreId = user.role === "master"
      ? null
      : user.restaurant_id ?? (await getDefaultStoreId());
    const token = signToken(user.id, fallbackStoreId, user.role);

    res.status(200).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        restaurantId: fallbackStoreId
      }
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getBootstrapStatus,
  register,
  login
};
