import React, { useState, useEffect } from 'react';
import OrderCard from '../components/OrderCard';
import { getOrderHistory, deleteOrder } from '../api/ordersApi';

const OrderHistory = () => {
  const [orders, setOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchOrderHistory();
  }, []);

  useEffect(() => {
    filterOrders();
  }, [orders, statusFilter, searchTerm]);

  const fetchOrderHistory = async () => {
    try {
      setLoading(true);
      const data = await getOrderHistory();
      setOrders(data);
      setError(null);
    } catch (err) {
      setError('Erro ao carregar histórico de pedidos');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (orderId) => {
    try {
      await deleteOrder(orderId);
      await fetchOrderHistory();
    } catch (err) {
      setError('Erro ao deletar pedido');
      console.error(err);
    }
  };

  const filterOrders = () => {
    let filtered = [...orders];

    if (statusFilter) {
      filtered = filtered.filter(order => order.status === statusFilter);
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(order => {
        const name = (order.customer_name || order.customerName || '').toString().toLowerCase();
        const phone = (order.customer_phone || order.phone || '').toString().toLowerCase();
        const id = (order.id || order.order_id || '').toString().toLowerCase();
        return name.includes(term) || phone.includes(term) || id.includes(term);
      });
    }

    setFilteredOrders(filtered);
  };

  if (loading) return <div className="page-content">Carregando histórico...</div>;
  if (error) return <div className="page-content error-message">{error}</div>;

  return (
    <div className="page-content">
      <h1>Histórico de Pedidos</h1>
      <div className="history-controls">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">Todos os status</option>
          <option value="entregue">Entregue</option>
          <option value="cancelado">Cancelado</option>
        </select>
        <input
          type="text"
          placeholder="Buscar por cliente, telefone ou ID"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="history-list">
        {filteredOrders.length === 0 ? (
          <p>Nenhum pedido encontrado</p>
        ) : (
          filteredOrders.map(order => (
            <OrderCard key={order.id || order.order_id} order={order} onStatusChange={() => {}} onDelete={handleDelete} />
          ))
        )}
      </div>
    </div>
  );
};

export default OrderHistory;
