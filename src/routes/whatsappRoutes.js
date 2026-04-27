const express = require("express");
const {
  gerarQRCode,
  getStatus,
  reconnectWhatsApp
} = require("../services/whatsappService");

const router = express.Router();

router.get("/qr", async (req, res, next) => {
  try {
    const clientId = req.query.clientId || "default";
    const payload = await gerarQRCode(clientId);
    res.status(200).json(payload);
  } catch (error) {
    next(error);
  }
});

router.get("/status", (req, res) => {
  const clientId = req.query.clientId || "default";
  res.status(200).json(getStatus(clientId));
});

router.post("/reconnect", async (req, res, next) => {
  try {
    const clientId = req.body.clientId || req.query.clientId || "default";
    const payload = await reconnectWhatsApp(clientId);
    res.status(200).json(payload);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
