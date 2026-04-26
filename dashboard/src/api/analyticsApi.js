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

export const getOrdersByHour = async (days = 7) => {
  const response = await api.get(`/analytics/by-hour?days=${days}`);
  return response.data;
};

export const getOrdersByDay = async (days = 30) => {
  const response = await api.get(`/analytics/by-day?days=${days}`);
  return response.data;
};

export const getOrderStatusDistribution = async (days = 30) => {
  const response = await api.get(`/analytics/status-distribution?days=${days}`);
  return response.data;
};
