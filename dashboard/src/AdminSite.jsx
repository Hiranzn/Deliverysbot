import React, { useEffect, useState } from 'react';
import { getCurrentUser, isAuthenticated, logout } from './api/authApi';
import Login from './pages/Login';
import AdminPanel from './pages/AdminPanel';

function AdminSite() {
  const [authenticated, setAuthenticated] = useState(isAuthenticated());
  const currentUser = getCurrentUser();
  const isMaster = currentUser?.role === 'master';

  useEffect(() => {
    document.title = 'Administração | Delivery WhatsApp';
    setAuthenticated(isAuthenticated());
  }, []);

  const handleLoginSuccess = () => {
    setAuthenticated(true);
  };

  const handleLogout = () => {
    logout();
    setAuthenticated(false);
  };

  if (!authenticated) {
    return (
      <div className="admin-site-shell">
        <div className="admin-site-hero">
          <p className="admin-site-kicker">Área Separada</p>
          <h1>Painel Administrativo</h1>
          <p>Ambiente exclusivo para gestão de empresas, lojas, usuários e conexões do WhatsApp.</p>
        </div>
        <Login onLoginSuccess={handleLoginSuccess} />
      </div>
    );
  }

  if (!isMaster) {
    return (
      <div className="admin-site-shell">
        <section className="page-content admin-access-card">
          <h1>Acesso restrito</h1>
          <p>Esta área administrativa separada está disponível apenas para o usuário master.</p>
          <div className="admin-access-actions">
            <a className="button button-primary" href="/">Ir para o painel operacional</a>
            <button className="button button-danger" type="button" onClick={handleLogout}>
              Sair
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="admin-site-shell">
      <header className="admin-site-header">
        <div>
          <p className="admin-site-kicker">Site Administrativo</p>
          <h1>Administração do Delivery WhatsApp</h1>
        </div>
        <div className="admin-site-actions">
          <a className="nav-button" href="/">Painel Operacional</a>
          <button className="nav-button logout" type="button" onClick={handleLogout}>
            Sair
          </button>
        </div>
      </header>

      <main className="admin-site-main">
        <AdminPanel />
      </main>
    </div>
  );
}

export default AdminSite;
