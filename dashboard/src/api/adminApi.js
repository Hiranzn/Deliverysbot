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

export const getAdminUsers = async () => {
  const response = await api.get('/admin/users');
  return response.data;
};

export const createAdminUser = async (payload) => {
  const response = await api.post('/admin/users', payload);
  return response.data;
};

export const updateAdminUser = async (userId, payload) => {
  const response = await api.patch(`/admin/users/${userId}`, payload);
  return response.data;
};

export const getAdminCompanies = async () => {
  const response = await api.get('/admin/companies');
  return response.data;
};

export const createAdminCompany = async (payload) => {
  const response = await api.post('/admin/companies', payload);
  return response.data;
};

export const getAdminStores = async () => {
  const response = await api.get('/admin/stores');
  return response.data;
};

export const createAdminStore = async (payload) => {
  const response = await api.post('/admin/stores', payload);
  return response.data;
};
