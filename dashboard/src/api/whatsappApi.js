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
});

export const getWhatsAppQr = async (storeId = null) => {
  const config = storeId ? { params: { storeId } } : {};
  const response = await api.get('/whatsapp/qr', config);
  return response.data;
};

export const getWhatsAppStatus = async (storeId = null) => {
  const config = storeId ? { params: { storeId } } : {};
  const response = await api.get('/whatsapp/status', config);
  return response.data;
};

export const reconnectWhatsApp = async (storeId = null) => {
  const payload = storeId ? { storeId } : {};
  const response = await api.post('/whatsapp/reconnect', payload);
  return response.data;
};
