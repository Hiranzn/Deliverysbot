const {
  gerarQRCode,
  getStatus,
  reconnectWhatsApp
} = require("../services/whatsappService");
const { getStoreScopeId, normalizeStoreScopeId } = require("../utils/tenantScope");

function createHttpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function sanitizeStoreId(storeId) {
  const normalized = normalizeStoreScopeId(storeId);

  if (!normalized) {
    throw createHttpError("storeId é obrigatório", 400);
  }

  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(normalized)) {
    throw createHttpError("storeId inválido", 400);
  }

  return normalized;
}

function resolveStoreId(req) {
  if (!req.user) {
    throw createHttpError("Usuário não autenticado", 401);
  }

  if (req.user.isMaster) {
    const requestedStoreId =
      req.query.storeId ||
      req.query.companyId ||
      req.query.clientId ||
      req.query.restaurantId ||
      req.body?.storeId ||
      req.body?.companyId ||
      req.body?.clientId ||
      req.body?.restaurantId ||
      getStoreScopeId(req.user) ||
      "default";

    return sanitizeStoreId(requestedStoreId);
  }

  const userStoreId = getStoreScopeId(req.user);

  if (!userStoreId) {
    throw createHttpError("Usuário sem loja vinculada", 403);
  }

  return sanitizeStoreId(userStoreId);
}

async function getQRCode(req, res, next) {
  try {
    const storeId = resolveStoreId(req);
    const payload = await gerarQRCode(storeId);
    res.status(200).json(payload);
  } catch (error) {
    next(error);
  }
}

async function getConnectionStatus(req, res, next) {
  try {
    const storeId = resolveStoreId(req);
    const payload = await getStatus(storeId);
    res.status(200).json(payload);
  } catch (error) {
    next(error);
  }
}

async function reconnect(req, res, next) {
  try {
    const storeId = resolveStoreId(req);
    const payload = await reconnectWhatsApp(storeId);
    res.status(200).json(payload);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getQRCode,
  getConnectionStatus,
  reconnect
};
