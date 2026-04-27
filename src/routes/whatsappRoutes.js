const express = require("express");
const {
  getQRCode,
  getConnectionStatus,
  reconnect
} = require("../controllers/whatsappController");

const router = express.Router();

router.get("/qr", getQRCode);
router.get("/status", getConnectionStatus);
router.post("/reconnect", reconnect);

module.exports = router;
