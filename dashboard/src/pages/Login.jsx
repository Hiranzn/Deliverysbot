import React, { useState } from 'react';
import { login } from '../api/authApi';
import './Login.css';

function Login({ onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (!email || !password) {
        setError('Email e senha são obrigatórios');
        setLoading(false);
        return;
      }

      await login(email, password);
      onLoginSuccess();
    } catch (err) {
      console.error('Erro ao fazer login:', err);
      setError(err.response?.data?.error || 'Erro ao fazer login. Verifique suas credenciais.');
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h1>Painel de Controle</h1>
        <p className="login-subtitle">Delivery WhatsApp</p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Senha</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={loading}
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" disabled={loading} className="login-button">
            {loading ? 'Carregando...' : 'Entrar'}
          </button>
        </form>

        <div className="login-info">
          <p>Primeira vez?</p>
          <p className="small">Entre em contato com o administrador para criar sua conta.</p>
        </div>
      </div>
    </div>
  );
}

export default Login;
