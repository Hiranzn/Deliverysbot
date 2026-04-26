import axios from 'axios';
import { getToken } from './authApi';

const API_BASE_URL = 'http://localhost:3000';

const api = axios.create({
  baseURL: API_BASE_URL,
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

export const getOrders = async () => {
  const response = await api.get('/orders');
  return response.data;
};

export const getOrderHistory = async () => {
  const response = await api.get('/orders/history');
  return response.data;
};

export const updateOrderStatus = async (orderId, status) => {
  const response = await api.patch(`/orders/${orderId}/status`, { status });
  return response.data;
};

export const deleteOrder = async (orderId) => {
  const response = await api.delete(`/orders/${orderId}`);
  return response.data;
};