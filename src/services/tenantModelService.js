const pool = require("../config/db");

function createHttpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

let schemaInitialized = false;

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

async function columnExists(tableName, columnName) {
  const result = await pool.query(
    `
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
    ) AS exists
    `,
    [tableName, columnName]
  );

  return result.rows[0]?.exists === true;
}

async function getColumnType(tableName, columnName) {
  const result = await pool.query(
    `
    SELECT udt_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = $1
      AND column_name = $2
    LIMIT 1
    `,
    [tableName, columnName]
  );

  return result.rows[0]?.udt_name || null;
}

async function getNameExpression(tableName, alias) {
  const hasName = await columnExists(tableName, "name");
  const hasNome = await columnExists(tableName, "nome");
  const prefix = alias ? `${alias}.` : "";

  if (hasName && hasNome) {
    return `COALESCE(${prefix}name, ${prefix}nome)`;
  }

  if (hasName) {
    return `${prefix}name`;
  }

  if (hasNome) {
    return `${prefix}nome`;
  }

  return "NULL";
}

async function constraintExists(constraintName) {
  const result = await pool.query(
    `
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.table_constraints
      WHERE table_schema = 'public'
        AND constraint_name = $1
    ) AS exists
    `,
    [constraintName]
  );

  return result.rows[0]?.exists === true;
}

async function ensureCompaniesTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS companies (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NULL UNIQUE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS name TEXT`);
  await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS slug TEXT`);
  await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE`);
  await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);

  if (await columnExists("companies", "nome")) {
    await pool.query(`
      UPDATE companies
      SET name = COALESCE(NULLIF(TRIM(name), ''), NULLIF(TRIM(nome), ''))
      WHERE name IS NULL OR TRIM(name) = ''
    `);

    await pool.query(`
      UPDATE companies
      SET nome = COALESCE(NULLIF(TRIM(nome), ''), NULLIF(TRIM(name), ''))
      WHERE nome IS NULL OR TRIM(nome) = ''
    `).catch(() => null);
  }

  await pool.query(`
    UPDATE companies
    SET name = COALESCE(NULLIF(TRIM(name), ''), CONCAT('Empresa ', id))
    WHERE name IS NULL OR TRIM(name) = ''
  `);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS companies_slug_unique_idx ON companies (slug) WHERE slug IS NOT NULL`);
}

async function ensureStoresTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stores (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NULL,
      name TEXT NOT NULL DEFAULT 'Loja principal',
      slug TEXT NULL UNIQUE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`ALTER TABLE stores ADD COLUMN IF NOT EXISTS company_id INTEGER`);
  await pool.query(`ALTER TABLE stores ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT 'Loja principal'`);
  await pool.query(`ALTER TABLE stores ADD COLUMN IF NOT EXISTS slug TEXT`);
  await pool.query(`ALTER TABLE stores ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE`);
  await pool.query(`ALTER TABLE stores ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);

  if (await columnExists("stores", "nome")) {
    await pool.query(`
      UPDATE stores
      SET name = COALESCE(NULLIF(TRIM(name), ''), NULLIF(TRIM(nome), ''))
      WHERE name IS NULL OR TRIM(name) = ''
    `).catch(() => null);

    await pool.query(`
      UPDATE stores
      SET nome = COALESCE(NULLIF(TRIM(nome), ''), NULLIF(TRIM(name), ''))
      WHERE nome IS NULL OR TRIM(nome) = ''
    `).catch(() => null);
  }

  await pool.query(`
    UPDATE stores
    SET name = COALESCE(NULLIF(TRIM(name), ''), CONCAT('Loja ', id))
    WHERE name IS NULL OR TRIM(name) = ''
  `);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS stores_slug_unique_idx ON stores (slug) WHERE slug IS NOT NULL`);

  if (!(await constraintExists("stores_company_id_fk"))) {
    await pool.query(`
      ALTER TABLE stores
      ADD CONSTRAINT stores_company_id_fk
      FOREIGN KEY (company_id)
      REFERENCES companies (id)
      ON DELETE SET NULL
    `);
  }
}

async function ensureDefaultCompanyForStores() {
  const storesExist = await tableExists("stores");
  if (!storesExist) {
    return;
  }

  const missingCompanyLinks = await pool.query(`
    SELECT COUNT(*)::INTEGER AS count
    FROM stores
    WHERE company_id IS NULL
  `);

  if ((missingCompanyLinks.rows[0]?.count ?? 0) === 0) {
    return;
  }

  let defaultCompanyId = null;
  const existingCompany = await pool.query(`
    SELECT id
    FROM companies
    ORDER BY created_at ASC, id ASC
    LIMIT 1
  `);

  if (existingCompany.rows.length > 0) {
    defaultCompanyId = existingCompany.rows[0].id;
  } else {
    const hasLegacyNomeColumn = await columnExists("companies", "nome");
    const createdCompany = hasLegacyNomeColumn
      ? await pool.query(
        `
        INSERT INTO companies (name, nome, slug)
        VALUES ('Empresa padrão', 'Empresa padrão', 'empresa-padrao')
        RETURNING id
        `
      )
      : await pool.query(
        `
        INSERT INTO companies (name, slug)
        VALUES ('Empresa padrão', 'empresa-padrao')
        RETURNING id
        `
      );

    defaultCompanyId = createdCompany.rows[0].id;
  }

  await pool.query(
    `
    UPDATE stores
    SET company_id = $1
    WHERE company_id IS NULL
    `,
    [defaultCompanyId]
  );
}

async function ensureUsersTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'user',
      company_id INTEGER NULL,
      store_id INTEGER NULL,
      restaurant_id INTEGER NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user'`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS company_id INTEGER`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS store_id INTEGER`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS restaurant_id INTEGER`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE`);

  const userStoreIdType = await getColumnType("users", "store_id");
  if (userStoreIdType && userStoreIdType !== "text" && userStoreIdType !== "varchar") {
    await pool.query(`
      ALTER TABLE users
      ALTER COLUMN store_id TYPE TEXT
      USING store_id::text
    `).catch(() => null);
  }

  const userRestaurantIdType = await getColumnType("users", "restaurant_id");
  if (userRestaurantIdType && userRestaurantIdType !== "text" && userRestaurantIdType !== "varchar") {
    await pool.query(`
      ALTER TABLE users
      ALTER COLUMN restaurant_id TYPE TEXT
      USING restaurant_id::text
    `).catch(() => null);
  }

  await pool.query(`
    UPDATE users
    SET store_id = COALESCE(store_id, restaurant_id, company_id::text)
    WHERE store_id IS NULL
      AND (restaurant_id IS NOT NULL OR company_id IS NOT NULL)
  `);

  await pool.query(`
    UPDATE users AS u
    SET company_id = NULL
    WHERE u.company_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM companies c
        WHERE c.id = u.company_id
      )
  `).catch(() => null);

  await pool.query(`
    UPDATE users AS u
    SET store_id = NULL
    WHERE u.store_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM stores s
        WHERE s.id::text = u.store_id::text
      )
  `).catch(() => null);

  if (await tableExists("stores") && await columnExists("stores", "company_id")) {
    await pool.query(`
      UPDATE users AS u
      SET company_id = s.company_id
      FROM stores AS s
      WHERE u.store_id::text = s.id::text
        AND (u.company_id IS DISTINCT FROM s.company_id OR u.company_id IS NULL)
    `).catch(() => null);
  }

  const usersStoreIdTypeAfter = await getColumnType("users", "store_id");
  const storesIdType = await getColumnType("stores", "id");

  if (
    !(await constraintExists("users_store_id_fk")) &&
    usersStoreIdTypeAfter &&
    storesIdType &&
    usersStoreIdTypeAfter === storesIdType
  ) {
    await pool.query(`
      ALTER TABLE users
      ADD CONSTRAINT users_store_id_fk
      FOREIGN KEY (store_id)
      REFERENCES stores (id)
      ON DELETE SET NULL
    `).catch(() => null);
  }

  if (!(await constraintExists("users_company_id_fk"))) {
    await pool.query(`
      ALTER TABLE users
      ADD CONSTRAINT users_company_id_fk
      FOREIGN KEY (company_id)
      REFERENCES companies (id)
      ON DELETE SET NULL
    `);
  }
}

async function ensureWhatsAppSessionsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_sessions (
      id SERIAL PRIMARY KEY,
      store_id INTEGER NULL,
      company_id TEXT NULL,
      session_key TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'disconnected',
      session_data JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`ALTER TABLE whatsapp_sessions ADD COLUMN IF NOT EXISTS store_id INTEGER`);
  await pool.query(`ALTER TABLE whatsapp_sessions ADD COLUMN IF NOT EXISTS company_id TEXT`);
  await pool.query(`ALTER TABLE whatsapp_sessions ADD COLUMN IF NOT EXISTS session_key TEXT`);
  await pool.query(`ALTER TABLE whatsapp_sessions ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'disconnected'`);
  await pool.query(`ALTER TABLE whatsapp_sessions ADD COLUMN IF NOT EXISTS session_data JSONB NOT NULL DEFAULT '{}'::jsonb`);
  await pool.query(`ALTER TABLE whatsapp_sessions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await pool.query(`ALTER TABLE whatsapp_sessions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);

  await pool.query(`
    UPDATE whatsapp_sessions
    SET session_key = COALESCE(
      session_key,
      CASE
        WHEN store_id IS NOT NULL THEN store_id::text
        ELSE NULL
      END,
      company_id
    )
    WHERE session_key IS NULL
  `).catch(() => null);

  await pool.query(`
    UPDATE whatsapp_sessions
    SET store_id = CASE
      WHEN store_id IS NOT NULL THEN store_id
      WHEN session_key ~ '^[0-9]+$' THEN session_key::integer
      WHEN company_id ~ '^[0-9]+$' THEN company_id::integer
      ELSE NULL
    END
    WHERE store_id IS NULL
  `).catch(() => null);

  if (!(await constraintExists("whatsapp_sessions_store_id_fk"))) {
    await pool.query(`
      ALTER TABLE whatsapp_sessions
      ADD CONSTRAINT whatsapp_sessions_store_id_fk
      FOREIGN KEY (store_id)
      REFERENCES stores (id)
      ON DELETE CASCADE
    `).catch(() => null);
  }

  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_sessions_store_id_unique_idx ON whatsapp_sessions (store_id) WHERE store_id IS NOT NULL`);
}

async function ensureTenantModel() {
  if (schemaInitialized) {
    return;
  }

  await ensureCompaniesTable();
  await ensureStoresTable();
  await ensureDefaultCompanyForStores();
  await ensureUsersTable();
  await ensureWhatsAppSessionsTable();

  schemaInitialized = true;
}

async function getStoreById(storeId) {
  await ensureTenantModel();

  const normalizedStoreId = String(storeId || "").trim();
  if (!normalizedStoreId) {
    throw createHttpError("storeId inválido", 400);
  }

  const storeNameExpression = await getNameExpression("stores", "s");

  const result = await pool.query(
    `
    SELECT s.id, s.company_id, ${storeNameExpression} AS name, s.slug, s.is_active, s.created_at
    FROM stores s
    WHERE s.id::text = $1::text
    LIMIT 1
    `,
    [normalizedStoreId]
  );

  return result.rows[0] || null;
}

async function getCompanyById(companyId) {
  await ensureTenantModel();

  const normalizedCompanyId = Number.parseInt(String(companyId), 10);
  if (!Number.isFinite(normalizedCompanyId)) {
    throw createHttpError("companyId inválido", 400);
  }

  const companyNameExpression = await getNameExpression("companies", "c");
  const result = await pool.query(
    `
    SELECT c.id, ${companyNameExpression} AS name, c.slug, c.is_active, c.created_at
    FROM companies c
    WHERE c.id = $1
    LIMIT 1
    `,
    [normalizedCompanyId]
  );

  return result.rows[0] || null;
}

async function getDefaultStore() {
  await ensureTenantModel();

  const storeNameExpression = await getNameExpression("stores", "s");

  const result = await pool.query(`
    SELECT s.id, s.company_id, ${storeNameExpression} AS name, s.slug, s.is_active, s.created_at
    FROM stores s
    ORDER BY s.created_at ASC NULLS LAST, s.id ASC
    LIMIT 1
  `);

  return result.rows[0] || null;
}

module.exports = {
  ensureTenantModel,
  getCompanyById,
  getStoreById,
  getDefaultStore,
  tableExists
};
