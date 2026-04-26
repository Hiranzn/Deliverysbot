const analyticsService = require("../services/analyticsService");

async function getOrdersByHour(req, res, next) {
  try {
    const { days = 7 } = req.query;
    const result = await analyticsService.getOrdersByHour(days);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function getOrdersByDay(req, res, next) {
  try {
    const { days = 30 } = req.query;
    const result = await analyticsService.getOrdersByDay(days);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function getOrderStatusDistribution(req, res, next) {
  try {
    const { days = 30 } = req.query;
    const result = await analyticsService.getOrderStatusDistribution(days);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getOrdersByHour,
  getOrdersByDay,
  getOrderStatusDistribution
};
