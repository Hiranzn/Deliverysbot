require("dotenv").config();
const app = require("./app");
const { startWhatsApp } = require("./services/whatsappService");

const PORT = process.env.PORT || 3000;
const AUTO_START_WHATSAPP = process.env.WHATSAPP_AUTO_START === "true";

app.listen(PORT, async () => {
  console.log(`Servidor rodando na porta ${PORT}`);

  if (!AUTO_START_WHATSAPP) {
    console.log("WhatsApp auto-start desabilitado. A conexão será iniciada sob demanda via endpoint /whatsapp/qr.");
    return;
  }

  try {
    await startWhatsApp();
  } catch (error) {
    console.error("Erro ao iniciar o WhatsApp automaticamente:", error);
  }
});
