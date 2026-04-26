import React, { useState, useEffect } from 'react';
import { isAuthenticated, logout } from './api/authApi';
import Login from './pages/Login';
import ActiveOrders from './pages/ActiveOrders';
import OrderHistory from './pages/OrderHistory';
import Analytics from './pages/Analytics';

function App() {
  const [currentPage, setCurrentPage] = useState('active');
  const [authenticated, setAuthenticated] = useState(isAuthenticated());

  useEffect(() => {
    setAuthenticated(isAuthenticated());
  }, []);

  const handleLogout = () => {
    logout();
    setAuthenticated(false);
  };

  const handleLoginSuccess = () => {
    setAuthenticated(true);
  };

  if (!authenticated) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="app-header-content">
          <h1>Painel de controle - Entrega do chatbot no WhatsApp</h1>
          <nav className="app-nav">
            <button
              onClick={() => setCurrentPage('active')}
              className={currentPage === 'active' ? 'nav-button active' : 'nav-button'}
            >
              Pedidos Ativos
            </button>
            <button
              onClick={() => setCurrentPage('history')}
              className={currentPage === 'history' ? 'nav-button active' : 'nav-button'}
            >
              Histórico
            </button>
            <button
              onClick={() => setCurrentPage('analytics')}
              className={currentPage === 'analytics' ? 'nav-button active' : 'nav-button'}
            >
              Análises
            </button>
            <button
              onClick={handleLogout}
              className="nav-button logout"
            >
              Sair
            </button>
          </nav>
        </div>
      </header>

      <main className="app-main">
        {currentPage === 'active' && <ActiveOrders />}
        {currentPage === 'history' && <OrderHistory />}
        {currentPage === 'analytics' && <Analytics />}
      </main>
    </div>
  );
}

export default App;
