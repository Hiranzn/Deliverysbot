import React, { useEffect, useState } from 'react';
import { getBootstrapStatus, login, register } from '../api/authApi';
import './Login.css';

function Login({ onLoginSuccess }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [canRegister, setCanRegister] = useState(false);
  const [statusLoaded, setStatusLoaded] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadBootstrapStatus() {
      try {
        const status = await getBootstrapStatus();

        if (!active) {
          return;
        }

        setCanRegister(Boolean(status.canRegister));
        setMode(status.canRegister ? 'register' : 'login');
      } catch (err) {
        console.error('Erro ao verificar status inicial do login:', err);
      } finally {
        if (active) {
          setStatusLoaded(true);
        }
      }
    }

    loadBootstrapStatus();

    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (!email || !password) {
        setError('Email e senha são obrigatórios');
        return;
      }

      if (mode === 'register') {
        if (password.length < 6) {
          setError('A senha deve ter pelo menos 6 caracteres');
          return;
        }

        if (password !== confirmPassword) {
          setError('As senhas não coincidem');
          return;
        }

        await register(email, password);
      }

      await login(email, password);
      onLoginSuccess();
    } catch (err) {
      console.error('Erro de autenticação:', err);
      setError(err.response?.data?.error || 'Não foi possível concluir a autenticação.');
    } finally {
      setLoading(false);
    }
  };

  const title = mode === 'register' ? 'Criar primeiro acesso' : 'Painel de Controle';
  const buttonLabel = loading
    ? 'Carregando...'
    : mode === 'register'
      ? 'Criar conta e entrar'
      : 'Entrar';

  return (
    <div className="login-container">
      <div className="login-box">
        <h1>{title}</h1>
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
              placeholder="Digite sua senha"
              disabled={loading}
            />
          </div>

          {mode === 'register' && (
            <div className="form-group">
              <label htmlFor="confirmPassword">Confirmar senha</label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repita sua senha"
                disabled={loading}
              />
            </div>
          )}

          {error && <div className="error-message">{error}</div>}

          <button type="submit" disabled={loading || !statusLoaded} className="login-button">
            {buttonLabel}
          </button>
        </form>

        <div className="login-info">
          {mode === 'register' ? (
            <p className="small">Este formulário aparece apenas enquanto ainda não existe nenhum usuário cadastrado. A primeira conta será criada como usuário master.</p>
          ) : (
            <>
              <p>Primeira vez?</p>
              <p className="small">
                {canRegister
                  ? 'Crie o primeiro acesso usando este formulário.'
                  : 'Entre em contato com o administrador para criar sua conta.'}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default Login;
