import axios from 'axios';

const API_BASE_URL = 'http://localhost:3000';

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
  
  return response.data;
};

export const logout = () => {
  localStorage.removeItem('token');
};

export const getToken = () => {
  return localStorage.getItem('token');
};

export const isAuthenticated = () => {
  return !!getToken();
};
