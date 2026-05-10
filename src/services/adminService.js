const bcrypt = require("bcrypt");
const pool = require("../config/db");
const {
  ensureTenantModel,
  getCompanyById,
  getStoreById
} = require("./tenantModelService");

function createHttpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeOptionalInteger(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeOptionalStoreId(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const normalized = String(value).trim();
  return normalized || null;
}

function normalizeOptionalBoolean(value) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;

  return undefined;
}

function normalizeRole(role) {
  const normalized = String(role || "").trim().toLowerCase();
  const allowedRoles = new Set(["master", "admin", "user"]);

  if (!allowedRoles.has(normalized)) {
    throw createHttpError("role inválido. Use master, admin ou user.", 400);
  }

  return normalized;
}

function normalizeName(name, fieldName) {
  const normalized = String(name || "").trim();

  if (!normalized) {
    throw createHttpError(`${fieldName} é obrigatório`, 400);
  }

  return normalized;
}

function normalizeSlug(slug) {
  if (slug === undefined || slug === null || slug === "") {
    return null;
  }

  const normalized = String(slug)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");

  if (!/^[a-z0-9-]+$/.test(normalized)) {
    throw createHttpError("slug inválido. Use apenas letras minúsculas, números e hífen.", 400);
  }

  return normalized;
}

async function legacyNameColumnExists(tableName) {
  const result = await pool.query(
    `
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = 'nome'
    ) AS exists
    `,
    [tableName]
  );

  return result.rows[0]?.exists === true;
}

async function getNameExpression(tableName, alias) {
  const hasLegacyNomeColumn = await legacyNameColumnExists(tableName);
  const prefix = alias ? `${alias}.` : "";

  if (hasLegacyNomeColumn) {
    return `COALESCE(${prefix}name, ${prefix}nome)`;
  }

  return `${prefix}name`;
}

function buildUserResponse(row) {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    isActive: row.is_active,
    companyId: row.company_id !== null && row.company_id !== undefined ? String(row.company_id) : null,
    companyName: row.company_name || null,
    storeId: row.store_id !== null && row.store_id !== undefined ? String(row.store_id) : null,
    storeName: row.store_name || null,
    restaurantId: row.store_id !== null && row.store_id !== undefined ? String(row.store_id) : null,
    createdAt: row.created_at
  };
}

function buildCompanyResponse(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    isActive: row.is_active,
    createdAt: row.created_at,
    storesCount: row.stores_count !== undefined ? Number(row.stores_count) : undefined,
    usersCount: row.users_count !== undefined ? Number(row.users_count) : undefined
  };
}

function buildStoreResponse(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    isActive: row.is_active,
    createdAt: row.created_at,
    companyId: row.company_id !== null && row.company_id !== undefined ? String(row.company_id) : null,
    companyName: row.company_name || null,
    usersCount: row.users_count !== undefined ? Number(row.users_count) : undefined
  };
}

async function resolveAssignment({ role, companyId, storeId }) {
  const normalizedCompanyId = normalizeOptionalInteger(companyId);
  const normalizedStoreId = normalizeOptionalStoreId(storeId);

  if (role === "master") {
    return {
      companyId: null,
      storeId: null
    };
  }

  let resolvedStore = null;
  if (normalizedStoreId !== null) {
    resolvedStore = await getStoreById(normalizedStoreId);

    if (!resolvedStore) {
      throw createHttpError("Loja informada não foi encontrada", 404);
    }
  }

  let resolvedCompanyId = normalizedCompanyId;
  if (resolvedStore) {
    if (
      normalizedCompanyId !== null &&
      resolvedStore.company_id !== null &&
      resolvedStore.company_id !== normalizedCompanyId
    ) {
      throw createHttpError("A loja informada não pertence à empresa selecionada", 409);
    }

    resolvedCompanyId = resolvedStore.company_id ?? normalizedCompanyId;
  }

  if (resolvedCompanyId !== null) {
    const company = await getCompanyById(resolvedCompanyId);

    if (!company) {
      throw createHttpError("Empresa informada não foi encontrada", 404);
    }
  }

  if (role === "admin" && !resolvedCompanyId) {
    throw createHttpError("Usuário admin precisa estar vinculado a uma empresa", 400);
  }

  if (role === "user" && !resolvedStore) {
    throw createHttpError("Usuário comum precisa estar vinculado a uma loja", 400);
  }

  return {
    companyId: resolvedCompanyId,
    storeId: resolvedStore?.id ?? null
  };
}

async function listUsers() {
  await ensureTenantModel();

  const companyNameExpression = await getNameExpression("companies", "c");
  const storeNameExpression = await getNameExpression("stores", "s");

  const result = await pool.query(`
    SELECT
      u.id,
      u.email,
      u.role,
      u.is_active,
      u.company_id,
      u.store_id,
      u.created_at,
      ${companyNameExpression} AS company_name,
      ${storeNameExpression} AS store_name
    FROM users u
    LEFT JOIN companies c ON c.id = u.company_id
    LEFT JOIN stores s ON s.id::text = u.store_id::text
    ORDER BY u.created_at DESC, u.id DESC
  `);

  return result.rows.map(buildUserResponse);
}

async function createUser(payload) {
  await ensureTenantModel();

  const email = normalizeEmail(payload.email);
  const password = String(payload.password || "");
  const role = normalizeRole(payload.role || "user");
  const isActive = normalizeOptionalBoolean(payload.isActive);

  if (!email || !password) {
    throw createHttpError("email e password são obrigatórios", 400);
  }

  if (password.length < 6) {
    throw createHttpError("A senha deve ter pelo menos 6 caracteres", 400);
  }

  const existing = await pool.query(
    `SELECT id FROM users WHERE email = $1 LIMIT 1`,
    [email]
  );

  if (existing.rows.length > 0) {
    throw createHttpError("Email já está em uso", 409);
  }

  const assignment = await resolveAssignment({
    role,
    companyId: payload.companyId,
    storeId: payload.storeId
  });

  const passwordHash = await bcrypt.hash(password, 10);
  const result = await pool.query(
    `
    INSERT INTO users (
      email,
      password_hash,
      role,
      company_id,
      store_id,
      restaurant_id,
      is_active,
      created_at
    )
    VALUES ($1, $2, $3, $4, $5, $5, $6, CURRENT_TIMESTAMP)
    RETURNING id, email, role, company_id, store_id, is_active, created_at
    `,
    [
      email,
      passwordHash,
      role,
      assignment.companyId,
      assignment.storeId,
      isActive ?? true
    ]
  );

  const createdUser = result.rows[0];
  const companyNameExpression = await getNameExpression("companies", "c");
  const storeNameExpression = await getNameExpression("stores", "s");
  const hydrated = await pool.query(
    `
    SELECT
      u.id,
      u.email,
      u.role,
      u.is_active,
      u.company_id,
      u.store_id,
      u.created_at,
      ${companyNameExpression} AS company_name,
      ${storeNameExpression} AS store_name
    FROM users u
    LEFT JOIN companies c ON c.id = u.company_id
    LEFT JOIN stores s ON s.id::text = u.store_id::text
    WHERE u.id = $1
    LIMIT 1
    `,
    [createdUser.id]
  );

  return buildUserResponse(hydrated.rows[0]);
}

async function updateUser(userId, payload) {
  await ensureTenantModel();

  const normalizedUserId = normalizeOptionalInteger(userId);
  if (normalizedUserId === null) {
    throw createHttpError("userId inválido", 400);
  }

  const existing = await pool.query(
    `
    SELECT id, email, role, company_id, store_id, is_active
    FROM users
    WHERE id = $1
    LIMIT 1
    `,
    [normalizedUserId]
  );

  if (existing.rows.length === 0) {
    throw createHttpError("Usuário não encontrado", 404);
  }

  const currentUser = existing.rows[0];
  const nextRole = payload.role !== undefined
    ? normalizeRole(payload.role)
    : currentUser.role;

  const assignment = await resolveAssignment({
    role: nextRole,
    companyId: payload.companyId !== undefined ? payload.companyId : currentUser.company_id,
    storeId: payload.storeId !== undefined ? payload.storeId : currentUser.store_id
  });

  const nextEmail = payload.email !== undefined
    ? normalizeEmail(payload.email)
    : currentUser.email;

  if (!nextEmail) {
    throw createHttpError("email inválido", 400);
  }

  if (nextEmail !== currentUser.email) {
    const emailConflict = await pool.query(
      `SELECT id FROM users WHERE email = $1 AND id <> $2 LIMIT 1`,
      [nextEmail, normalizedUserId]
    );

    if (emailConflict.rows.length > 0) {
      throw createHttpError("Email já está em uso", 409);
    }
  }

  const nextIsActive = payload.isActive !== undefined
    ? normalizeOptionalBoolean(payload.isActive)
    : currentUser.is_active;

  if (payload.isActive !== undefined && nextIsActive === undefined) {
    throw createHttpError("isActive inválido", 400);
  }

  let passwordFragment = "";
  const params = [
    nextEmail,
    nextRole,
    assignment.companyId,
    assignment.storeId,
    nextIsActive,
    normalizedUserId
  ];

  if (payload.password !== undefined) {
    const password = String(payload.password || "");

    if (password.length < 6) {
      throw createHttpError("A senha deve ter pelo menos 6 caracteres", 400);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    passwordFragment = `, password_hash = $${params.length + 1}`;
    params.push(passwordHash);
  }

  await pool.query(
    `
    UPDATE users
    SET
      email = $1,
      role = $2,
      company_id = $3,
      store_id = $4,
      restaurant_id = $4,
      is_active = $5
      ${passwordFragment}
    WHERE id = $6
    `,
    params
  );

  const companyNameExpression = await getNameExpression("companies", "c");
  const storeNameExpression = await getNameExpression("stores", "s");
  const hydrated = await pool.query(
    `
    SELECT
      u.id,
      u.email,
      u.role,
      u.is_active,
      u.company_id,
      u.store_id,
      u.created_at,
      ${companyNameExpression} AS company_name,
      ${storeNameExpression} AS store_name
    FROM users u
    LEFT JOIN companies c ON c.id = u.company_id
    LEFT JOIN stores s ON s.id::text = u.store_id::text
    WHERE u.id = $1
    LIMIT 1
    `,
    [normalizedUserId]
  );

  return buildUserResponse(hydrated.rows[0]);
}

async function listCompanies() {
  await ensureTenantModel();

  const companyNameExpression = await getNameExpression("companies", "c");

  const result = await pool.query(`
    SELECT
      c.id,
      ${companyNameExpression} AS name,
      c.slug,
      c.is_active,
      c.created_at,
      COUNT(DISTINCT s.id) AS stores_count,
      COUNT(DISTINCT u.id) AS users_count
    FROM companies c
    LEFT JOIN stores s ON s.company_id = c.id
    LEFT JOIN users u ON u.company_id = c.id
    GROUP BY c.id, ${companyNameExpression}, c.slug, c.is_active, c.created_at
    ORDER BY c.created_at DESC, c.id DESC
  `);

  return result.rows.map(buildCompanyResponse);
}

async function createCompany(payload) {
  await ensureTenantModel();

  const name = normalizeName(payload.name, "name");
  const slug = normalizeSlug(payload.slug);
  const isActive = normalizeOptionalBoolean(payload.isActive);
  const hasLegacyNomeColumn = await legacyNameColumnExists("companies");

  const result = await (
    hasLegacyNomeColumn
      ? pool.query(
        `
        INSERT INTO companies (name, nome, slug, is_active, created_at)
        VALUES ($1, $1, $2, $3, NOW())
        RETURNING id, COALESCE(name, nome) AS name, slug, is_active, created_at
        `,
        [name, slug, isActive ?? true]
      )
      : pool.query(
        `
        INSERT INTO companies (name, slug, is_active, created_at)
        VALUES ($1, $2, $3, NOW())
        RETURNING id, name, slug, is_active, created_at
        `,
        [name, slug, isActive ?? true]
      )
  ).catch((error) => {
    if (error.code === "23505") {
      throw createHttpError("Já existe uma empresa com esse slug", 409);
    }

    throw error;
  });

  return buildCompanyResponse(result.rows[0]);
}

async function listStores() {
  await ensureTenantModel();

  const storeNameExpression = await getNameExpression("stores", "s");
  const companyNameExpression = await getNameExpression("companies", "c");

  const result = await pool.query(`
    SELECT
      s.id,
      ${storeNameExpression} AS name,
      s.slug,
      s.is_active,
      s.created_at,
      s.company_id,
      ${companyNameExpression} AS company_name,
      COUNT(DISTINCT u.id) AS users_count
    FROM stores s
    LEFT JOIN companies c ON c.id = s.company_id
    LEFT JOIN users u ON u.store_id::text = s.id::text
    GROUP BY
      s.id,
      ${storeNameExpression},
      s.slug,
      s.is_active,
      s.created_at,
      s.company_id,
      ${companyNameExpression}
    ORDER BY s.created_at DESC, s.id DESC
  `);

  return result.rows.map(buildStoreResponse);
}

async function createStore(payload) {
  await ensureTenantModel();

  const name = normalizeName(payload.name, "name");
  const slug = normalizeSlug(payload.slug);
  const isActive = normalizeOptionalBoolean(payload.isActive);
  const companyId = normalizeOptionalInteger(payload.companyId);

  if (companyId === null) {
    throw createHttpError("companyId é obrigatório para criar uma loja", 400);
  }

  const company = await getCompanyById(companyId);
  if (!company) {
    throw createHttpError("Empresa informada não foi encontrada", 404);
  }

  const hasLegacyNomeColumn = await legacyNameColumnExists("stores");
  const result = await (
    hasLegacyNomeColumn
      ? pool.query(
        `
        INSERT INTO stores (company_id, name, nome, slug, is_active, created_at)
        VALUES ($1, $2, $2, $3, $4, NOW())
        RETURNING id, company_id, COALESCE(name, nome) AS name, slug, is_active, created_at
        `,
        [companyId, name, slug, isActive ?? true]
      )
      : pool.query(
        `
        INSERT INTO stores (company_id, name, slug, is_active, created_at)
        VALUES ($1, $2, $3, $4, NOW())
        RETURNING id, company_id, name, slug, is_active, created_at
        `,
        [companyId, name, slug, isActive ?? true]
      )
  ).catch((error) => {
    if (error.code === "23505") {
      throw createHttpError("Já existe uma loja com esse slug", 409);
    }

    throw error;
  });

  return buildStoreResponse({
    ...result.rows[0],
    company_name: company.name
  });
}

module.exports = {
  listUsers,
  createUser,
  updateUser,
  listCompanies,
  createCompany,
  listStores,
  createStore
};
