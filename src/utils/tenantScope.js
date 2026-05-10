function normalizeStoreScopeId(value, fallback = null) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return String(value).trim();
}

function getStoreScopeId(source, fallback = null) {
  if (!source) {
    return fallback;
  }

  const candidates = [
    source.storeId,
    source.store_id,
    source.restaurantId,
    source.restaurant_id,
    source.companyId,
    source.company_id
  ];

  for (const candidate of candidates) {
    const normalized = normalizeStoreScopeId(candidate);

    if (normalized) {
      return normalized;
    }
  }

  return fallback;
}

module.exports = {
  normalizeStoreScopeId,
  getStoreScopeId
};
