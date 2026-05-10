import React, { useEffect, useRef, useState } from 'react';
import { getCurrentUser } from '../api/authApi';
import { getWhatsAppStatus, reconnectWhatsApp } from '../api/whatsappApi';

const POLLING_INTERVAL = 3000;

function ConnectWhatsApp() {
  const [status, setStatus] = useState('desconhecido');
  const [qrBase64, setQrBase64] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resolvedStoreId, setResolvedStoreId] = useState('');
  const pollRef = useRef(null);
  const currentUser = getCurrentUser();

  const clearPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const getStoreScope = () => {
    if (currentUser?.role === 'master') {
      return null;
    }

    return currentUser?.storeId || currentUser?.companyId || currentUser?.restaurantId || null;
  };

  const applyStatus = (data) => {
    setStatus(data.status || 'desconhecido');
    setResolvedStoreId(data.storeId || data.companyId || data.restaurantId || '');
    setQrBase64(data.qrBase64 || null);
  };

  const fetchStatus = async () => {
    const data = await getWhatsAppStatus(getStoreScope());
    applyStatus(data);
    setError('');
    return data;
  };

  const startPolling = () => {
    clearPolling();
    pollRef.current = setInterval(async () => {
      try {
        await fetchStatus();
      } catch (pollError) {
        setError('Falha ao atualizar status do WhatsApp.');
      }
    }, POLLING_INTERVAL);
  };

  const handleConnect = async () => {
    setLoading(true);
    setError('');
    setQrBase64(null);

    try {
      await reconnectWhatsApp(getStoreScope());
      await fetchStatus();
      startPolling();
    } catch (requestError) {
      setError('Não foi possível iniciar conexão do WhatsApp.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus().catch(() => {
      setError('Não foi possível carregar o status atual do WhatsApp.');
    });

    startPolling();

    return () => {
      clearPolling();
    };
  }, []);

  const companyLabel =
    resolvedStoreId ||
    currentUser?.storeId ||
    currentUser?.companyId ||
    currentUser?.restaurantId ||
    (currentUser?.role === 'master' ? 'default' : 'não vinculado');

  const buttonLabel = loading
    ? 'Conectando...'
    : status === 'connected'
      ? 'Gerar novo QR Code'
      : 'Conectar';

  return (
    <section className="page-content">
      <h1>Conectar WhatsApp</h1>
      <p>Conecte sua conta do WhatsApp via QR Code sem precisar abrir o terminal.</p>

      <p>
        <strong>Identificador conectado:</strong> {companyLabel}
      </p>

      <div className="whatsapp-connect-controls">
        <button className="button button-primary" onClick={handleConnect} disabled={loading}>
          {buttonLabel}
        </button>
      </div>

      <p>
        <strong>Status:</strong> {status}
      </p>

      {error && <p className="error-message">{error}</p>}

      <div className="whatsapp-qr-area">
        {qrBase64 ? (
          <img src={qrBase64} alt="QR Code para conectar WhatsApp" className="whatsapp-qr-image" />
        ) : (
          <p>QR Code será exibido aqui após clicar em conectar.</p>
        )}
      </div>
    </section>
  );
}

export default ConnectWhatsApp;
