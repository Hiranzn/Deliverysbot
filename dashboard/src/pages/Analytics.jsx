import React, { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { getOrdersByHour, getOrdersByDay, getOrderStatusDistribution } from '../api/analyticsApi';

const COLORS = ['#2563eb', '#16a34a', '#dc2626', '#f59e0b', '#8b5cf6'];

const statusNameMap = {
  novo: 'Novo',
  recebido: 'Recebidos',
  em_preparo: 'Em Preparo',
  saiu_para_entrega: 'Sairam para entrega',
  entregue: 'Entregas',
  cancelado: 'Cancelados'
};

const Analytics = () => {
  const [hourlyData, setHourlyData] = useState([]);
  const [dailyData, setDailyData] = useState([]);
  const [statusData, setStatusData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hourFilter, setHourFilter] = useState(7);
  const [dayFilter, setDayFilter] = useState(30);

  useEffect(() => {
    fetchAnalytics();
  }, [hourFilter, dayFilter]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const [hourly, daily, status] = await Promise.all([
        getOrdersByHour(hourFilter),
        getOrdersByDay(dayFilter),
        getOrderStatusDistribution(dayFilter)
      ]);

      setHourlyData(hourly);
      setDailyData(daily);
      setStatusData(status);
      setError(null);
    } catch (err) {
      setError('Erro ao carregar análises');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="page-content">Carregando análises...</div>;
  if (error) return <div className="page-content error-message">{error}</div>;

  return (
    <div className="page-content">
      <h1>Análises e Relatórios</h1>

      <div className="analytics-filters">
        <div className="filter-group">
          <label>Últimas horas:</label>
          <select value={hourFilter} onChange={(e) => setHourFilter(Number(e.target.value))}>
            <option value={1}>1 dia</option>
            <option value={7}>7 dias</option>
            <option value={14}>14 dias</option>
            <option value={30}>30 dias</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Período (dias):</label>
          <select value={dayFilter} onChange={(e) => setDayFilter(Number(e.target.value))}>
            <option value={7}>7 dias</option>
            <option value={14}>14 dias</option>
            <option value={30}>30 dias</option>
            <option value={90}>90 dias</option>
          </select>
        </div>
      </div>

      <div className="charts-grid">
        <div className="chart-container">
          <h2>Pedidos por Hora</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={hourlyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="time"
                tickFormatter={(value) => new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit' })}
              />
              <YAxis />
              <Tooltip
                formatter={(value) => value}
                labelFormatter={(value) => new Date(value).toLocaleString('pt-BR')}
              />
              <Legend />
              <Line type="monotone" dataKey="orders" stroke="#2563eb" name="Pedidos" />
              <Line type="monotone" dataKey="completed" stroke="#16a34a" name="Entregas" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-container">
          <h2>Pedidos por Dia</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickFormatter={(value) => new Date(value).toLocaleDateString('pt-BR')}
              />
              <YAxis />
              <Tooltip
                formatter={(value) => value}
                labelFormatter={(value) => new Date(value).toLocaleDateString('pt-BR')}
              />
              <Legend />
              <Line type="monotone" dataKey="orders" stroke="#2563eb" name="Pedidos" />
              <Line type="monotone" dataKey="completed" stroke="#16a34a" name="Entregas" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="chart-container">
        <h2>Distribuição de Status</h2>
        <ResponsiveContainer width="100%" height={400}>
          <PieChart>
            <Pie
              data={statusData.map((entry) => ({
                ...entry,
                name: statusNameMap[entry.name] || entry.name
              }))}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, value, percent }) =>
                `${name}: ${value} (${(percent * 100).toFixed(0)}%)`
              }
              outerRadius={100}
              fill="#8884d8"
              dataKey="value"
            >
              {statusData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => value} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default Analytics;
