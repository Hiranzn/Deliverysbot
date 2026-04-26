function mapIncomingOrder(payload) {
  const endereco = payload?.cliente?.endereco || payload?.endereco || {};

  return {
    pedidoId: payload.pedido_id,
    source: payload.canal || "whatsapp",
    cliente: {
      nome: payload?.cliente?.nome,
      telefone: payload?.cliente?.telefone
    },
    endereco: {
      rua: endereco.rua,
      numero: endereco.numero,
      bairro: endereco.bairro,
      cidade: endereco.cidade,
      referencia: endereco.referencia
    },
    itens: payload.itens || [],
    pagamento: {
      metodo: payload?.pagamento?.metodo,
      trocoPara: Number(payload?.pagamento?.troco_para || 0),
      status: payload?.pagamento?.status || "pendente"
    },
    entrega: {
      tipo: payload?.entrega?.tipo,
      taxa: Number(payload?.entrega?.taxa || 0),
      status: payload?.entrega?.status
    },
    resumo: {
      subtotal: Number(payload?.resumo?.subtotal || 0),
      total: Number(payload?.resumo?.total || 0)
    },
    statusPedido: payload?.status_pedido || "recebido",
    criadoEm: payload?.criado_em,
    observacoesGerais: null
  };
}

module.exports = { mapIncomingOrder };