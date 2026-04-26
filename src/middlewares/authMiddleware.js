const jwt = require("jsonwebtoken");

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ error: "Token não fornecido" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    if (!payload || !payload.id || !payload.restaurantId) {
      return res.status(401).json({ error: "Token inválido" });
    }

    req.user = {
      id: payload.id,
      restaurantId: payload.restaurantId
    };

    next();
  } catch (error) {
    return res.status(401).json({ error: "Token inválido" });
  }
}

module.exports = authMiddleware;
