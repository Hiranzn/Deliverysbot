const fallbackApiUrl = 'http://localhost:3000';

function normalizeApiUrl(value) {
  const normalized = String(value || '').trim();

  if (!normalized) {
    return fallbackApiUrl;
  }

  return normalized.replace(/\/+$/, '');
}

export const API_BASE_URL = normalizeApiUrl(import.meta.env.VITE_API_URL);
