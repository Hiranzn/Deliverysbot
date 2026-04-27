const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/authRoutes");
const ordersRoutes = require("./routes/ordersRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");
const whatsappRoutes = require("./routes/whatsappRoutes");

const app = express();

app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ message: "API de pedidos funcionando" });
});

app.use("/auth", authRoutes);
app.use("/orders", ordersRoutes);
app.use("/analytics", analyticsRoutes);
app.use("/whatsapp", whatsappRoutes);

app.use((err, req, res, next) => {
  console.error(err);

  res.status(err.statusCode || 500).json({
    error: err.message || "Erro interno do servidor"
  });
});

module.exports = app;
