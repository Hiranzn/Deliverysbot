import axios from 'axios';
import { getToken } from './authApi';
import { API_BASE_URL } from './apiBase';

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

export const getOrdersByHour = async (days = 7, storeId = null) => {
  const params = new URLSearchParams({ days: String(days) });
  if (storeId) {
    params.set('storeId', String(storeId));
  }

  const response = await api.get(`/analytics/by-hour?${params.toString()}`);
  return response.data;
};

export const getOrdersByDay = async (days = 30, storeId = null) => {
  const params = new URLSearchParams({ days: String(days) });
  if (storeId) {
    params.set('storeId', String(storeId));
  }

  const response = await api.get(`/analytics/by-day?${params.toString()}`);
  return response.data;
};

export const getOrderStatusDistribution = async (days = 30, storeId = null) => {
  const params = new URLSearchParams({ days: String(days) });
  if (storeId) {
    params.set('storeId', String(storeId));
  }

  const response = await api.get(`/analytics/status-distribution?${params.toString()}`);
  return response.data;
};
