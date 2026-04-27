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

export const getWhatsAppQr = async (companyId = 'default') => {
  const response = await api.get('/whatsapp/qr', {
    params: { companyId },
  });
  return response.data;
};

export const getWhatsAppStatus = async (companyId = 'default') => {
  const response = await api.get('/whatsapp/status', {
    params: { companyId },
  });
  return response.data;
};

export const reconnectWhatsApp = async (companyId = 'default') => {
  const response = await api.post('/whatsapp/reconnect', { companyId });
  return response.data;
};
