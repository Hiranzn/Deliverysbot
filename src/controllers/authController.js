const pool = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { getStoreScopeId } = require("../utils/tenantScope");
const {
  ensureTenantModel,
  getStoreById,
  getDefaultStore
} = require("../services/tenantModelService");

function createHttpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeOptionalStoreId(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const normalized = String(value).trim();
  return normalized || null;
}

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw createHttpError("JWT_SECRET não configurado no ambiente", 500);
  }

  return secret;
}

function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      role: user.role || "user",
      storeId: user.storeId ?? null,
      companyId: user.companyId ?? null,
      restaurantId: user.storeId ?? null
    },
    getJwtSecret(),
    {
      expiresIn: "1h"
    }
  );
}

function buildAuthResponseUser(user) {
  const scopedStoreId = user.role === "master"
    ? null
    : getStoreScopeId(user);
  const scopedCompanyId = user.role === "master"
    ? null
    : (user.company_id ?? user.companyId ?? null);

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    companyId: scopedCompanyId !== null && scopedCompanyId !== undefined ? String(scopedCompanyId) : null,
    storeId: scopedStoreId ?? null,
    restaurantId: scopedStoreId ?? null,
    isActive: user.is_active ?? true
  };
}

function tryGetAuthenticatedUser(req) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return null;
  }

  try {
    return jwt.verify(token, getJwtSecret());
  } catch (error) {
    return null;
  }
}

async function getUsersCount() {
  await ensureTenantModel();

  const result = await pool.query(`SELECT COUNT(*)::INTEGER AS count FROM users`);
  return result.rows[0]?.count ?? 0;
}

async function getMasterUsersCount() {
  await ensureTenantModel();

  const result = await pool.query(
    `SELECT COUNT(*)::INTEGER AS count FROM users WHERE role = 'master'`
  );

  return result.rows[0]?.count ?? 0;
}

async function resolveAssignedStore(requestedStoreId) {
  const normalizedRequestedStoreId = normalizeOptionalStoreId(requestedStoreId);

  if (normalizedRequestedStoreId !== null) {
    const store = await getStoreById(normalizedRequestedStoreId);

    if (!store) {
      throw createHttpError("Loja informada não foi encontrada", 404);
    }

    return store;
  }

  const defaultStore = await getDefaultStore();
  return defaultStore;
}

async function getBootstrapStatus(req, res, next) {
  try {
    const masterUsersCount = await getMasterUsersCount();
    const usersCount = await getUsersCount();

    res.status(200).json({
      canRegister: masterUsersCount === 0,
      usersCount
    });
  } catch (error) {
    next(error);
  }
}

async function register(req, res, next) {
  try {
    await ensureTenantModel();

    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");
    const masterUsersCount = await getMasterUsersCount();
    const authenticatedUser = tryGetAuthenticatedUser(req);
    const isBootstrap = masterUsersCount === 0;
    const isAuthenticatedMaster = authenticatedUser?.role === "master";

    if (!isBootstrap && !isAuthenticatedMaster) {
      throw createHttpError("Cadastro público desabilitado após a configuração inicial", 403);
    }

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
    const requestedRole = String(req.body.role || "").trim().toLowerCase();
    const assignedStore = await resolveAssignedStore(
      req.body.storeId ?? req.body.restaurantId ?? req.body.companyId
    );

    const role = isBootstrap
      ? "master"
      : (isAuthenticatedMaster && requestedRole === "master" ? "master" : "user");

    const storeId = role === "master" ? null : (assignedStore?.id ?? null);
    const companyId = role === "master" ? null : (assignedStore?.company_id ?? null);

    const result = await pool.query(
      `
      INSERT INTO users (email, password_hash, role, company_id, store_id, restaurant_id, created_at)
      VALUES ($1, $2, $3, $4, $5, $5, CURRENT_TIMESTAMP)
      RETURNING id, email, role, company_id, store_id, restaurant_id, is_active
      `,
      [email, passwordHash, role, companyId, storeId]
    );

    res.status(201).json({
      message: "Usuário registrado com sucesso",
      user: buildAuthResponseUser(result.rows[0])
    });
  } catch (error) {
    next(error);
  }
}

async function login(req, res, next) {
  try {
    await ensureTenantModel();

    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");

    if (!email || !password) {
      throw createHttpError("Email e senha são obrigatórios", 400);
    }

    const result = await pool.query(
      `
      SELECT id, email, password_hash, role, company_id, store_id, restaurant_id, is_active
      FROM users
      WHERE email = $1
      LIMIT 1
      `,
      [email]
    );

    if (result.rows.length === 0) {
      throw createHttpError("Credenciais inválidas", 401);
    }

    const user = result.rows[0];

    if (user.is_active === false) {
      throw createHttpError("Usuário inativo", 403);
    }

    const match = await bcrypt.compare(password, user.password_hash);

    if (!match) {
      throw createHttpError("Credenciais inválidas", 401);
    }

    const authUser = {
      id: user.id,
      role: user.role,
      companyId: user.role === "master" ? null : (user.company_id ?? null),
      storeId: user.role === "master" ? null : getStoreScopeId(user)
    };

    const token = signToken(authUser);

    res.status(200).json({
      token,
      user: buildAuthResponseUser(user)
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
