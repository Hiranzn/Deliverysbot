require("dotenv").config();
const app = require("./app");
const { startWhatsApp } = require("./services/whatsappService");

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(`Servidor rodando na porta ${PORT}`);

  try {
    await startWhatsApp();
  } catch (error) {
    console.error("Erro ao iniciar o WhatsApp:", error);
  }
});
