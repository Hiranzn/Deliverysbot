const pool = require("../config/db");
const { getStoreScopeId, normalizeStoreScopeId } = require("../utils/tenantScope");

function createHttpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeDays(value, fallback) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);

  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 365) {
    throw createHttpError("Parâmetro days inválido", 400);
  }

  return parsed;
}

function resolveScopedStoreId(scope = {}) {
  const storeId = normalizeStoreScopeId(getStoreScopeId(scope), null);
  return storeId || null;
}

function buildScopeClause(storeId, isMaster, days, fallbackDays, params, createdAtAlias = "created_at") {
  const daysPosition = params.push(normalizeDays(days, fallbackDays));
  let whereClause = `WHERE ${createdAtAlias} >= NOW() - ($${daysPosition}::text || ' days')::interval`;

  if (storeId !== null) {
    const storePosition = params.push(storeId);
    whereClause += ` AND store_id::text = $${storePosition}::text`;
  } else if (!isMaster) {
    throw createHttpError("Usuário sem loja vinculada. Cadastre uma loja e vincule o usuário.", 409);
  }

  return whereClause;
}

async function getOrdersByHour(days = 7, scope = {}) {
  const storeId = resolveScopedStoreId(scope);
  const params = [];

  const whereClause = buildScopeClause(storeId, scope.isMaster === true, days, 7, params);
  const result = await pool.query(
    `
    SELECT
      DATE_TRUNC('hour', created_at) AS hour,
      COUNT(*) AS total_orders,
      SUM(total) AS total_revenue,
      COUNT(CASE WHEN status = 'entregue' THEN 1 END) AS completed_orders
    FROM orders
    ${whereClause}
    GROUP BY DATE_TRUNC('hour', created_at)
    ORDER BY hour ASC
    `,
    params
  );

  return result.rows.map(row => ({
    time: row.hour,
    orders: Number(row.total_orders),
    revenue: Number(row.total_revenue || 0),
    completed: Number(row.completed_orders)
  }));
}

async function getOrdersByDay(days = 30, scope = {}) {
  const storeId = resolveScopedStoreId(scope);
  const params = [];

  const whereClause = buildScopeClause(storeId, scope.isMaster === true, days, 30, params);
  const result = await pool.query(
    `
    SELECT
      DATE_TRUNC('day', created_at) AS day,
      COUNT(*) AS total_orders,
      SUM(total) AS total_revenue,
      COUNT(CASE WHEN status = 'entregue' THEN 1 END) AS completed_orders
    FROM orders
    ${whereClause}
    GROUP BY DATE_TRUNC('day', created_at)
    ORDER BY day ASC
    `,
    params
  );

  return result.rows.map(row => ({
    date: row.day,
    orders: Number(row.total_orders),
    revenue: Number(row.total_revenue || 0),
    completed: Number(row.completed_orders)
  }));
}

async function getOrderStatusDistribution(days = 30, scope = {}) {
  const storeId = resolveScopedStoreId(scope);
  const params = [];

  const whereClause = buildScopeClause(storeId, scope.isMaster === true, days, 30, params);
  const result = await pool.query(
    `
    SELECT
      status,
      COUNT(*) AS count
    FROM orders
    ${whereClause}
    GROUP BY status
    `,
    params
  );

  return result.rows.map(row => ({
    name: row.status,
    value: Number(row.count)
  }));
}

module.exports = {
  getOrdersByHour,
  getOrdersByDay,
  getOrderStatusDistribution
};
