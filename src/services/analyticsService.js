const pool = require("../config/db");

async function getOrdersByHour(days = 7) {
  const result = await pool.query(
    `
    SELECT
      DATE_TRUNC('hour', created_at) AS hour,
      COUNT(*) AS total_orders,
      SUM(total) AS total_revenue,
      COUNT(CASE WHEN status = 'entregue' THEN 1 END) AS completed_orders
    FROM orders
    WHERE created_at >= NOW() - INTERVAL '${days} days'
    GROUP BY DATE_TRUNC('hour', created_at)
    ORDER BY hour ASC
    `
  );

  return result.rows.map(row => ({
    time: row.hour,
    orders: Number(row.total_orders),
    revenue: Number(row.total_revenue || 0),
    completed: Number(row.completed_orders)
  }));
}

async function getOrdersByDay(days = 30) {
  const result = await pool.query(
    `
    SELECT
      DATE_TRUNC('day', created_at) AS day,
      COUNT(*) AS total_orders,
      SUM(total) AS total_revenue,
      COUNT(CASE WHEN status = 'entregue' THEN 1 END) AS completed_orders
    FROM orders
    WHERE created_at >= NOW() - INTERVAL '${days} days'
    GROUP BY DATE_TRUNC('day', created_at)
    ORDER BY day ASC
    `
  );

  return result.rows.map(row => ({
    date: row.day,
    orders: Number(row.total_orders),
    revenue: Number(row.total_revenue || 0),
    completed: Number(row.completed_orders)
  }));
}

async function getOrderStatusDistribution(days = 30) {
  const result = await pool.query(
    `
    SELECT
      status,
      COUNT(*) AS count
    FROM orders
    WHERE created_at >= NOW() - INTERVAL '${days} days'
    GROUP BY status
    `
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
