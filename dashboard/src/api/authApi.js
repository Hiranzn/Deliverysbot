import axios from 'axios';
import { API_BASE_URL } from './apiBase';

const USER_STORAGE_KEY = 'authUser';

const normalizeUserScope = (user) => {
  if (!user) {
    return user;
  }

  const storeId = user.storeId ?? user.companyId ?? user.restaurantId ?? null;

  return {
    ...user,
    storeId,
    companyId: user.companyId ?? storeId,
    restaurantId: user.restaurantId ?? storeId
  };
};

export const getBootstrapStatus = async () => {
  const response = await axios.get(`${API_BASE_URL}/auth/bootstrap-status`);
  return response.data;
};

export const register = async (email, password) => {
  const response = await axios.post(`${API_BASE_URL}/auth/register`, {
    email,
    password
  });

  return response.data;
};

export const login = async (email, password) => {
  const response = await axios.post(`${API_BASE_URL}/auth/login`, {
    email,
    password
  });
  
  if (response.data.token) {
    localStorage.setItem('token', response.data.token);
  }

  if (response.data.user) {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(normalizeUserScope(response.data.user)));
  }
  
  return response.data;
};

export const logout = () => {
  localStorage.removeItem('token');
  localStorage.removeItem(USER_STORAGE_KEY);
};

export const getToken = () => {
  return localStorage.getItem('token');
};

export const isAuthenticated = () => {
  return !!getToken();
};

export const getCurrentUser = () => {
  const rawUser = localStorage.getItem(USER_STORAGE_KEY);

  if (!rawUser) {
    return null;
  }

  try {
    return normalizeUserScope(JSON.parse(rawUser));
  } catch (error) {
    localStorage.removeItem(USER_STORAGE_KEY);
    return null;
  }
};
