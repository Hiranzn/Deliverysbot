const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");

router.get("/bootstrap-status", authController.getBootstrapStatus);
router.post("/register", authController.register);
router.post("/login", authController.login);

module.exports = router;
