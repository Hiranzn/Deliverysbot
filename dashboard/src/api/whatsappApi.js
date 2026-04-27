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
});

export const getWhatsAppQr = async (clientId = 'default') => {
  const response = await api.get('/whatsapp/qr', {
    params: { clientId },
  });
  return response.data;
};

export const getWhatsAppStatus = async (clientId = 'default') => {
  const response = await api.get('/whatsapp/status', {
    params: { clientId },
  });
  return response.data;
};

export const reconnectWhatsApp = async (clientId = 'default') => {
  const response = await api.post('/whatsapp/reconnect', { clientId });
  return response.data;
};
