const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/authRoutes");
const ordersRoutes = require("./routes/ordersRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");
const whatsappRoutes = require("./routes/whatsappRoutes");
const adminRoutes = require("./routes/adminRoutes");
const authMiddleware = require("./middlewares/authMiddleware");
const requireMaster = require("./middlewares/requireMaster");

const app = express();

function getAllowedOrigins() {
  const rawOrigins = process.env.CORS_ORIGIN || process.env.FRONTEND_URL || "http://localhost:5173";

  return rawOrigins
    .split(",")
    .map(origin => origin.trim())
    .filter(Boolean);
}

const allowedOrigins = getAllowedOrigins();

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error("Origem não permitida pelo CORS"));
  }
}));
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ message: "API de pedidos funcionando" });
});

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString()
  });
});

app.use("/auth", authRoutes);
app.use("/orders", ordersRoutes);
app.use("/analytics", analyticsRoutes);
app.use("/whatsapp", authMiddleware, whatsappRoutes);
app.use("/admin", authMiddleware, requireMaster, adminRoutes);

app.use((err, req, res, next) => {
  console.error(err);

  res.status(err.statusCode || 500).json({
    error: err.message || "Erro interno do servidor"
  });
});

module.exports = app;
