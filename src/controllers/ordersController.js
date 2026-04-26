const ordersService = require("../services/ordersService");

async function createOrder(req, res, next) {
  try {
    const result = await ordersService.createOrder(req.body);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

async function getOrders(req, res, next) {
  try {
    const restaurantId = req.user?.restaurantId;
    const result = await ordersService.getOrders(restaurantId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function updateOrderStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const restaurantId = req.user?.restaurantId;

    const result = await ordersService.updateOrderStatus(id, status, restaurantId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function getOrderHistory(req, res, next) {
  try {
    const restaurantId = req.user?.restaurantId;
    const result = await ordersService.getOrderHistory(restaurantId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function deleteOrder(req, res, next) {
  try {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId;
    const result = await ordersService.deleteOrder(id, restaurantId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createOrder,
  getOrders,
  getOrderHistory,
  updateOrderStatus,
  deleteOrder
};