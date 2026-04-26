const pool = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

function createHttpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function getDefaultStoreId() {
  const result = await pool.query(`
    SELECT id
    FROM stores
    ORDER BY created_at ASC
    LIMIT 1
  `);

  return result.rows.length > 0 ? result.rows[0].id : null;
}

async function register(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw createHttpError("email e senha são obrigatórios", 400);
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

    const result = await pool.query(
      `
      INSERT INTO users (email, password_hash, restaurant_id, created_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      RETURNING id, email, restaurant_id
      `,
      [email, passwordHash, restaurantId]
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
    const { email, password } = req.body;

    if (!email || !password) {
      throw createHttpError("email e senha são obrigatórios", 400);
    }

    const result = await pool.query(
      `SELECT id, email, password_hash, restaurant_id FROM users WHERE email = $1 LIMIT 1`,
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

    const token = jwt.sign(
      {
        id: user.id,
        restaurantId: user.restaurant_id
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "1h"
      }
    );

    res.status(200).json({ token });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  register,
  login
};
