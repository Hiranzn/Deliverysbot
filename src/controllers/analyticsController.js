const analyticsService = require("../services/analyticsService");
const { getStoreScopeId } = require("../utils/tenantScope");

function buildAnalyticsScope(req) {
  if (req.user?.isMaster) {
    return {
      isMaster: true,
      storeId:
        req.query.storeId ||
        req.query.companyId ||
        req.query.restaurantId ||
        null
    };
  }

  return {
    isMaster: false,
    storeId: getStoreScopeId(req.user)
  };
}

async function getOrdersByHour(req, res, next) {
  try {
    const { days = 7 } = req.query;
    const result = await analyticsService.getOrdersByHour(days, buildAnalyticsScope(req));
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function getOrdersByDay(req, res, next) {
  try {
    const { days = 30 } = req.query;
    const result = await analyticsService.getOrdersByDay(days, buildAnalyticsScope(req));
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function getOrderStatusDistribution(req, res, next) {
  try {
    const { days = 30 } = req.query;
    const result = await analyticsService.getOrderStatusDistribution(days, buildAnalyticsScope(req));
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
