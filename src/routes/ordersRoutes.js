const express = require("express");
const router = express.Router();
const ordersController = require("../controllers/ordersController");
const authMiddleware = require("../middlewares/authMiddleware");

router.post("/", ordersController.createOrder);
router.get("/", authMiddleware, ordersController.getOrders);
router.get("/history", authMiddleware, ordersController.getOrderHistory);
router.patch("/:id/status", authMiddleware, ordersController.updateOrderStatus);
router.delete("/:id", authMiddleware, ordersController.deleteOrder);

module.exports = router;