const express = require("express");
const router = express.Router();
const analyticsController = require("../controllers/analyticsController");
const authMiddleware = require("../middlewares/authMiddleware");

router.get("/by-hour", authMiddleware, analyticsController.getOrdersByHour);
router.get("/by-day", authMiddleware, analyticsController.getOrdersByDay);
router.get("/status-distribution", authMiddleware, analyticsController.getOrderStatusDistribution);

module.exports = router;
