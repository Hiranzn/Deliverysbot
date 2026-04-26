const pool = require("../config/db");
const { mapIncomingOrder } = require("../utils/orderMapper");

function createHttpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function calcularSubtotalItens(itens) {
  return itens.reduce((total, item) => {
    return total + Number(item.quantidade) * Number(item.preco_unitario);
  }, 0);
}

function validarPayload(payload) {
  if (!payload.pedido_id) {
    throw createHttpError("pedido_id é obrigatório");
  }

  if (!payload.cliente?.nome) {
    throw createHttpError("cliente.nome é obrigatório");
  }

  if (!payload.cliente?.telefone) {
    throw createHttpError("cliente.telefone é obrigatório");
  }

  const endereco = payload?.cliente?.endereco || payload?.endereco;
  if (!endereco?.rua) {
    throw createHttpError("cliente.endereco.rua é obrigatório");
  }

  if (!Array.isArray(payload.itens) || payload.itens.length === 0) {
    throw createHttpError("O pedido deve conter pelo menos 1 item");
  }

  for (const item of payload.itens) {
    if (!item.nome) {
      throw createHttpError("Todo item deve ter nome");
    }

    if (!item.quantidade || Number(item.quantidade) <= 0) {
      throw createHttpError("Todo item deve ter quantidade válida");
    }

    if (item.preco_unitario === undefined || Number(item.preco_unitario) < 0) {
      throw createHttpError("Todo item deve ter preco_unitario válido");
    }
  }

  if (!payload.pagamento?.metodo) {
    throw createHttpError("pagamento.metodo é obrigatório");
  }

  if (!payload.entrega?.tipo) {
    throw createHttpError("entrega.tipo é obrigatório");
  }
}

async function getDefaultStoreId(client) {
  const result = await client.query(`
    SELECT id
    FROM stores
    ORDER BY created_at ASC
    LIMIT 1
  `);

  if (result.rows.length === 0) {
    throw createHttpError(
      "Nenhuma loja cadastrada em stores. Cadastre uma store antes de criar pedidos.",
      500
    );
  }

  return result.rows[0].id;
}

async function createOrUpdateCustomer(client, cliente) {
  const existingCustomer = await client.query(
    `
    SELECT id
    FROM customers
    WHERE phone = $1
    LIMIT 1
    `,
    [cliente.telefone]
  );

  if (existingCustomer.rows.length > 0) {
    const customerId = existingCustomer.rows[0].id;

    await client.query(
      `
      UPDATE customers
      SET name = $1
      WHERE id = $2
      `,
      [cliente.nome, customerId]
    );

    return customerId;
  }

  const customerResult = await client.query(
    `
    INSERT INTO customers (name, phone)
    VALUES ($1, $2)
    RETURNING id
    `,
    [cliente.nome, cliente.telefone]
  );

  return customerResult.rows[0].id;
}

async function createAddress(client, customerId, endereco) {
  const addressResult = await client.query(
    `
    INSERT INTO addresses (
      customer_id,
      street,
      number,
      neighborhood,
      city,
      reference_point
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id
    `,
    [
      customerId,
      endereco.rua,
      endereco.numero || null,
      endereco.bairro || null,  
      endereco.cidade || null,
      endereco.referencia || null
    ]
  );

  return addressResult.rows[0].id;
}

async function createOrder(payload) {
  validarPayload(payload);

  const data = mapIncomingOrder(payload);

  const subtotalCalculado = calcularSubtotalItens(data.itens);
  const deliveryFee = Number(data.entrega.taxa || 0);
  const discount = 0;
  const totalCalculado = subtotalCalculado + deliveryFee - discount;

  if (Math.abs(subtotalCalculado - data.resumo.subtotal) > 0.01) {
    throw createHttpError("resumo.subtotal não confere com os itens");
  }

  if (Math.abs(totalCalculado - data.resumo.total) > 0.01) {
    throw createHttpError("resumo.total não confere com subtotal + taxa");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const storeId = await getDefaultStoreId(client);
    const customerId = await createOrUpdateCustomer(client, data.cliente);
    const addressId = await createAddress(client, customerId, data.endereco);

    const orderNotes = `pedido_id_externo: ${data.pedidoId}${
      data.entrega.status ? ` | entrega_status: ${data.entrega.status}` : ""
    }`;

    const orderResult = await client.query(
      `
      INSERT INTO orders (
        store_id,
        customer_id,
        address_id,
        source,
        order_type,
        status,
        notes,
        subtotal,
        delivery_fee,
        discount,
        total,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, COALESCE($12, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
      RETURNING id, status, total, created_at
      `,
      [
        storeId,
        customerId,
        addressId,
        data.source,
        data.entrega.tipo,
        data.statusPedido,
        orderNotes,
        data.resumo.subtotal,
        deliveryFee,
        discount,
        data.resumo.total,
        data.criadoEm || null
      ]
    );

    const order = orderResult.rows[0];

    for (const item of data.itens) {
      const totalPrice = Number(item.quantidade) * Number(item.preco_unitario);

      await client.query(
        `
        INSERT INTO order_items (
          order_id,
          product_name,
          unit_price,
          quantity,
          item_notes,
          total_price
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          order.id,
          item.nome,
          item.preco_unitario,
          item.quantidade,
          item.observacao || null,
          totalPrice
        ]
      );
    }

    await client.query(
      `
      INSERT INTO payments (
        order_id,
        method,
        status,
        paid_amount,
        change_for
      )
      VALUES ($1, $2, $3, $4, $5)
      `,
      [
        order.id,
        data.pagamento.metodo,
        data.pagamento.status,
        data.resumo.total,
        data.pagamento.trocoPara || null
      ]
    );

    await client.query("COMMIT");

    return {
      message: "Pedido criado com sucesso",
      order: order
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function getOrders(restaurantId, isMaster = false) {
  if (!restaurantId && !isMaster) {
    throw createHttpError("Usuário sem loja vinculada. Cadastre uma loja e vincule o usuário.", 409);
  }

  const baseQuery = `
    SELECT
      o.id,
      o.source,
      o.order_type,
      o.status,
      o.notes,
      o.subtotal,
      o.delivery_fee,
      o.discount,
      o.total,
      o.created_at,
      o.updated_at,
      c.name AS customer_name,
      c.phone AS customer_phone,
      a.street,
      a.number,
      a.city,
      p.method AS payment_method,
      p.status AS payment_status,
      p.paid_amount,
      p.change_for,
      COALESCE(
        json_agg(
          json_build_object(
            'nome', oi.product_name,
            'quantidade', oi.quantity,
            'preco_unitario', oi.unit_price,
            'total_price', oi.total_price
          )
        ) FILTER (WHERE oi.id IS NOT NULL),
        '[]'
      ) AS items
    FROM orders o
    INNER JOIN customers c ON c.id = o.customer_id
    LEFT JOIN addresses a ON a.id = o.address_id
    LEFT JOIN payments p ON p.order_id = o.id
    LEFT JOIN order_items oi ON oi.order_id = o.id
    GROUP BY o.id, c.name, c.phone, a.street, a.number, a.city, p.method, p.status, p.paid_amount, p.change_for
    ORDER BY o.created_at DESC
    `;

  const result = isMaster
    ? await pool.query(baseQuery)
    : await pool.query(`${baseQuery.replace("GROUP BY", "WHERE o.store_id = $1\n    GROUP BY")}`, [restaurantId]);

  return result.rows;
}

async function updateOrderStatus(orderId, status, restaurantId, isMaster = false) {
  const allowedStatus = [
    "novo",
    "recebido",
    "confirmado",
    "em_preparo",
    "saiu_para_entrega",
    "entregue",
    "cancelado"
  ];

  if (!restaurantId && !isMaster) {
    throw createHttpError("Usuário sem loja vinculada. Cadastre uma loja e vincule o usuário.", 409);
  }

  if (!status) {
    throw createHttpError("status é obrigatório");
  }

  if (!allowedStatus.includes(status)) {
    throw createHttpError("Status inválido");
  }

  const query = `
    UPDATE orders
    SET status = $1,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $2
    RETURNING id, status, updated_at
    `;

  const result = isMaster
    ? await pool.query(query, [status, orderId])
    : await pool.query(`${query.replace("RETURNING", "      AND store_id = $3\n    RETURNING")}`, [status, orderId, restaurantId]);

  if (result.rows.length === 0) {
    throw createHttpError("Pedido não encontrado", 404);
  }

  return {
    message: "Status atualizado com sucesso",
    order: result.rows[0]
  };
}

async function getOrderHistory(restaurantId, isMaster = false) {
  if (!restaurantId && !isMaster) {
    throw createHttpError("Usuário sem loja vinculada. Cadastre uma loja e vincule o usuário.", 409);
  }

  const baseQuery = `
    SELECT
      o.id,
      o.source,
      o.order_type,
      o.status,
      o.notes,
      o.subtotal,
      o.delivery_fee,
      o.discount,
      o.total,
      o.created_at,
      o.updated_at,
      c.name AS customer_name,
      c.phone AS customer_phone,
      a.street,
      a.number,
      a.city,
      p.method AS payment_method,
      p.status AS payment_status,
      p.paid_amount,
      p.change_for,
      COALESCE(
        json_agg(
          json_build_object(
            'nome', oi.product_name,
            'quantidade', oi.quantity,
            'preco_unitario', oi.unit_price,
            'total_price', oi.total_price
          )
        ) FILTER (WHERE oi.id IS NOT NULL),
        '[]'
      ) AS items
    FROM orders o
    INNER JOIN customers c ON c.id = o.customer_id
    LEFT JOIN addresses a ON a.id = o.address_id
    LEFT JOIN payments p ON p.order_id = o.id
    LEFT JOIN order_items oi ON oi.order_id = o.id
    WHERE o.status IN ('entregue', 'cancelado')
    GROUP BY o.id, c.name, c.phone, a.street, a.number, a.city, p.method, p.status, p.paid_amount, p.change_for
    ORDER BY o.created_at DESC
    `;

  const result = isMaster
    ? await pool.query(baseQuery)
    : await pool.query(`${baseQuery.replace("GROUP BY", "      AND o.store_id = $1\n    GROUP BY")}`, [restaurantId]);

  return result.rows;
}

async function deleteOrder(orderId, restaurantId, isMaster = false) {
  if (!restaurantId && !isMaster) {
    throw createHttpError("Usuário sem loja vinculada. Cadastre uma loja e vincule o usuário.", 409);
  }

  if (!orderId) {
    throw createHttpError("ID do pedido é obrigatório");
  }

  const query = `
    DELETE FROM orders
    WHERE id = $1
    RETURNING id
    `;

  const result = isMaster
    ? await pool.query(query, [orderId])
    : await pool.query(`${query.replace("RETURNING", "      AND store_id = $2\n    RETURNING")}`, [orderId, restaurantId]);

  if (result.rows.length === 0) {
    throw createHttpError("Pedido não encontrado", 404);
  }

  return {
    message: "Pedido deletado com sucesso",
    order: result.rows[0]
  };
}

module.exports = {
  createOrder,
  getOrders,
  getOrderHistory,
  updateOrderStatus,
  deleteOrder
};
