const {
  gerarQRCode,
  getStatus,
  reconnectWhatsApp
} = require("../services/whatsappService");

function resolveCompanyId(req) {
  return req.user?.company_id || req.user?.restaurant_id || req.query.companyId || req.query.clientId || req.body?.companyId || req.body?.clientId || "default";
}

async function getQRCode(req, res, next) {
  try {
    const companyId = resolveCompanyId(req);
    const payload = await gerarQRCode(companyId);
    res.status(200).json(payload);
  } catch (error) {
    next(error);
  }
}

function getConnectionStatus(req, res, next) {
  try {
    const companyId = resolveCompanyId(req);
    const payload = getStatus(companyId);
    res.status(200).json(payload);
  } catch (error) {
    next(error);
  }
}

async function reconnect(req, res, next) {
  try {
    const companyId = resolveCompanyId(req);
    const payload = await reconnectWhatsApp(companyId);
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
