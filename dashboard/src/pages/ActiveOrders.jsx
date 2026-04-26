import React, { useState, useEffect } from 'react';
import OrderCard from '../components/OrderCard';
import { getOrders, updateOrderStatus, deleteOrder } from '../api/ordersApi';

const ActiveOrders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const data = await getOrders();
      setOrders(data);
      setError(null);
    } catch (err) {
      setError('Erro ao carregar pedidos');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (orderId, newStatus) => {
    try {
      await updateOrderStatus(orderId, newStatus);
      await fetchOrders();
    } catch (err) {
      setError('Erro ao atualizar status');
      console.error(err);
    }
  };

  const handleDelete = async (orderId) => {
    try {
      await deleteOrder(orderId);
      await fetchOrders();
    } catch (err) {
      setError('Erro ao deletar pedido');
      console.error(err);
    }
  };

  const groupOrdersByStatus = (orders) => {
    const groups = {
      'PENDENTE': [],
      'EM PREPARO': [],
      'CONCLUIDO': []
    };

    orders.forEach(order => {
      const status = order.status;
      if (status === 'novo' || status === 'recebido') {
        groups['PENDENTE'].push(order);
      } else if (status === 'em_preparo') {
        groups['EM PREPARO'].push(order);
      } else if (status === 'entregue') {
        groups['CONCLUIDO'].push(order);
      }
    });

    return groups;
  };

  if (loading) return <div className="page-content">Carregando pedidos...</div>;
  if (error) return <div className="page-content error-message">{error}</div>;

  const groupedOrders = groupOrdersByStatus(orders);

  return (
    <div className="page-content">
      <h1>Pedidos Ativos</h1>
      <div className="status-grid">
        {Object.entries(groupedOrders).map(([status, statusOrders]) => (
          <div key={status} className="status-column">
            <h2>{status}</h2>
            {statusOrders.length === 0 ? (
              <p>Nenhum pedido</p>
            ) : (
              statusOrders.map(order => (
                <OrderCard
                  key={order.id || order.order_id}
                  order={order}
                  onStatusChange={handleStatusChange}
                  onDelete={handleDelete}
                />
              ))
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ActiveOrders;
