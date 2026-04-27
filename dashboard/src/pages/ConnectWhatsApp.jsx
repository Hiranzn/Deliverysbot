import React, { useEffect, useRef, useState } from 'react';
import { getWhatsAppQr, getWhatsAppStatus } from '../api/whatsappApi';

const POLLING_INTERVAL = 3000;

function ConnectWhatsApp() {
  const [clientId, setClientId] = useState('default');
  const [status, setStatus] = useState('disconnected');
  const [qrBase64, setQrBase64] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const pollRef = useRef(null);

  const clearPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const fetchStatus = async (selectedClientId) => {
    const data = await getWhatsAppStatus(selectedClientId);
    setStatus(data.status);

    if (data.connected) {
      setQrBase64(null);
      clearPolling();
    }
  };

  const handleConnect = async () => {
    setLoading(true);
    setError('');

    try {
      const data = await getWhatsAppQr(clientId);
      setStatus(data.status);
      setQrBase64(data.qrBase64 || null);

      clearPolling();
      pollRef.current = setInterval(async () => {
        try {
          await fetchStatus(clientId);
          const qrData = await getWhatsAppQr(clientId);
          if (qrData.qrBase64) {
            setQrBase64(qrData.qrBase64);
          }
          setStatus(qrData.status);
        } catch (pollError) {
          clearPolling();
          setError('Falha ao atualizar status do WhatsApp.');
        }
      }, POLLING_INTERVAL);
    } catch (requestError) {
      setError('Não foi possível iniciar conexão do WhatsApp.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      clearPolling();
    };
  }, []);

  return (
    <section className="page-content">
      <h1>Conectar WhatsApp</h1>
      <p>Conecte sua conta do WhatsApp via QR Code sem precisar abrir o terminal.</p>

      <div className="whatsapp-connect-controls">
        <input
          type="text"
          value={clientId}
          onChange={(event) => setClientId(event.target.value.trim() || 'default')}
          placeholder="ID do cliente (ex: loja-1)"
        />
        <button className="button button-primary" onClick={handleConnect} disabled={loading}>
          {loading ? 'Conectando...' : 'Conectar'}
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
