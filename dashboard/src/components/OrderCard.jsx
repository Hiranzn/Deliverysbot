import React from 'react';

const OrderCard = ({ order, onStatusChange, onDelete }) => {
  const orderId = order.id || order.order_id;
  const customerName = order.customer_name || order.customerName || 'N/A';
  const rawPhone = order.customer_phone || order.phone || 'N/A';
  const phone = String(rawPhone).replace(/\D/g, '') || 'N/A';
  const address = order.address || `${order.street || ''}${order.number ? ', ' + order.number : ''}${order.city ? ', ' + order.city : ''}` || 'N/A';
  const rawItems = order.items || order.order_items || [];
  let items = [];

  if (typeof rawItems === 'string') {
    try {
      items = JSON.parse(rawItems);
    } catch {
      items = [];
    }
  } else if (Array.isArray(rawItems)) {
    items = rawItems;
  }

  const total = Number(order.total || order.total_amount || 0);
  const status = order.status || 'N/A';
  const createdAt = order.created_at || order.createdAt || order.createdAt;

  const statusLabel = () => {
    if (status === 'novo' || status === 'recebido') return 'PENDENTE';
    if (status === 'em_preparo') return 'EM PREPARO';
    if (status === 'entregue') return 'CONCLUÍDO';
    if (status === 'cancelado') return 'CANCELADO';
    return status.toUpperCase();
  };

  const canStartPrep = status === 'novo' || status === 'recebido';
  const canComplete = status === 'em_preparo';

  return (
    <div className="order-card">
      <div className="order-card-header">
        <div>
          <h3>Pedido #{orderId}</h3>
          <span className="order-status">{statusLabel()}</span>
        </div>
      </div>
      <div className="order-card-body">
        <p><strong>Cliente:</strong> {customerName}</p>
        <p><strong>Telefone:</strong> {phone}</p>
        <p><strong>Endereço:</strong> {address}</p>
        <p><strong>Itens:</strong> {items.length ? items.map(item => `${item.quantidade || item.quantity || 1} x ${item.nome || item.name}`).join(', ') : 'N/A'}</p>
        <p><strong>Total:</strong> R$ {total.toFixed(2)}</p>
        <p><strong>Data:</strong> {createdAt ? new Date(createdAt).toLocaleString() : 'N/A'}</p>
      </div>
      <div className="order-card-actions">
        {canStartPrep && (
          <button onClick={() => onStatusChange(orderId, 'em_preparo')} className="button button-primary">
            Iniciar Preparo
          </button>
        )}
        {canComplete && (
          <button onClick={() => onStatusChange(orderId, 'entregue')} className="button button-success">
            Concluir Pedido
          </button>
        )}
        <button onClick={() => {
          if (window.confirm('Tem certeza que deseja deletar este pedido?')) {
            onDelete(orderId);
          }
        }} className="button button-danger">
          Deletar
        </button>
      </div>
    </div>
  );
};

export default OrderCard;
