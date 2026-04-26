const { menu, categorias } = require("../data/menu");
const http = require("http");
const https = require("https");

const userSessions = {};

function extractPhone(remoteJid, remoteJidAlt, participant) {
  const candidate = remoteJid || remoteJidAlt || participant || "";
  const [phone] = candidate.split("@");
  return phone ? phone.replace(/\D/g, "") : null;
}

function buildAddress(rawAddress) {
  const parts = rawAddress.split(",").map(part => part.trim()).filter(Boolean);
  return {
    rua: parts[0] || "",
    numero: parts[1] || "",
    bairro: parts[2] || "",
    cidade: parts[3] || "",
    referencia: parts[4] || ""
  };
}

function formatCartItems(carrinho) {
  return carrinho.map(item => {
    const subtotal = item.quantidade * item.produto.preco;
    return `${item.quantidade} x ${item.produto.nome} - R$ ${subtotal.toFixed(2)}`;
  }).join("\n");
}

function calculateSubtotal(carrinho) {
  return carrinho.reduce((sum, item) => sum + item.quantidade * item.produto.preco, 0);
}

function formatOrderSummary(session) {
  const subtotal = calculateSubtotal(session.carrinho);
  const itemsText = formatCartItems(session.carrinho);
  const payment = session.pagamento?.metodo || "N/A";
  const address = session.endereco ? `${session.endereco.rua}${session.endereco.numero ? ", " + session.endereco.numero : ""}${session.endereco.bairro ? ", " + session.endereco.bairro : ""}${session.endereco.cidade ? ", " + session.endereco.cidade : ""}` : "N/A";
  const customerName = session.cliente?.nome || "N/A";
  const phone = session.cliente?.telefone || "N/A";

  return `Resumo do pedido:\n${itemsText}\n\nSubtotal: R$ ${subtotal.toFixed(2)}\nForma de pagamento: ${payment}\nNome: ${customerName}\nTelefone: ${phone}\nEndereço: ${address}`;
}

function postJson(url, data) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const lib = parsedUrl.protocol === "https:" ? https : http;
    const payload = JSON.stringify(data);

    const request = lib.request(
      parsedUrl,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload)
        }
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(body));
            } catch (error) {
              resolve(body);
            }
          } else {
            reject(new Error(`Erro ao enviar pedido: ${res.statusCode} ${body}`));
          }
        });
      }
    );

    request.on("error", reject);
    request.write(payload);
    request.end();
  });
}

async function sendOrderToBackend(session) {
  const subtotal = calculateSubtotal(session.carrinho);
  const endereco = {
    rua: session.endereco?.rua || "",
    numero: session.endereco?.numero || "",
    bairro: session.endereco?.bairro || "",
    cidade: session.endereco?.cidade || "",
    referencia: session.endereco?.referencia || ""
  };

  const payload = {
    pedido_id: `whatsapp-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    canal: "whatsapp",
    cliente: {
      nome: session.cliente?.nome || "Cliente WhatsApp",
      telefone: session.cliente?.telefone || "",
      endereco
    },
    endereco,
    itens: session.carrinho.map(item => ({
      nome: item.produto.nome,
      quantidade: item.quantidade,
      preco_unitario: item.produto.preco
    })),
    pagamento: {
      metodo: session.pagamento?.metodo || "Dinheiro",
      status: "pendente",
      troco_para: 0
    },
    entrega: {
      tipo: "delivery",
      taxa: 0,
      status: "pendente"
    },
    resumo: {
      subtotal,
      total: subtotal
    },
    status_pedido: "recebido"
  };

  return await postJson("http://localhost:3000/orders", payload);
}

async function handleMessage(sock, msg) {
  console.log("Mensagem completa:", JSON.stringify(msg, null, 2));

  if (!msg || !msg.key) {
    console.log("Mensagem inválida recebida no handleMessage:", msg);
    return;
  }

  const remoteJid = msg.key.remoteJid;
  const participant = msg.key.participant || msg.participant || null;
  const isGroup = remoteJid?.endsWith("@g.us");
  const isPrivate = remoteJid?.endsWith("@s.whatsapp.net") || remoteJid?.endsWith("@lid");

  console.log("remoteJid=", remoteJid, "participant=", participant, "isGroup=", isGroup, "isPrivate=", isPrivate);

  if (!isPrivate) {
    console.log("Ignorando mensagem não identificada como privada:", remoteJid);
    return;
  }

  const text =
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    "";

  const normalizedText = text.toLowerCase().trim();

  console.log("Mensagem recebida de", remoteJid, ":", text);

  if (!normalizedText) return;

  const session = userSessions[remoteJid] || {
    step: "inicio",
    carrinho: [],
    cliente: {},
    endereco: {},
    pagamento: {}
  };

  userSessions[remoteJid] = session;

  try {
    if (session.step === "inicio") {
      session.step = "menu";
      session.carrinho = [];
      session.cliente = {
        nome: msg.pushName || "",
        telefone: extractPhone(remoteJid, msg.key.remoteJidAlt, participant)
      };
      session.endereco = {};
      session.pagamento = {};

      await sock.sendMessage(remoteJid, {
        text: "Olá! Bem-vindo ao Delivery WhatsApp.\n1 - Menu\n2 - Finalizar pedido\n\nDigite 1 para ver o cardápio ou 2 para finalizar o pedido."
      });
      return;
    }

    if (session.step === "menu") {
      if (normalizedText === "1" || normalizedText.includes("menu")) {
        session.step = "categoria";
        await sock.sendMessage(remoteJid, {
          text: "Escolha uma categoria:\n1 - Lanches\n2 - Bebidas\n\nDigite o número da categoria desejada:"
        });
      } else if ((normalizedText === "2" || normalizedText.includes("finalizar")) && session.carrinho.length > 0) {
        session.step = "nome";
        if (session.cliente.nome) {
          await sock.sendMessage(remoteJid, {
            text: `Seu nome detectado é ${session.cliente.nome}. Caso queira alterar, digite seu nome agora.\nCaso contrário, digite 'ok' para continuar.`
          });
        } else {
          await sock.sendMessage(remoteJid, {
            text: "Por favor, informe seu nome para continuar com o pedido."
          });
        }
      } else if ((normalizedText === "2" || normalizedText.includes("finalizar")) && session.carrinho.length === 0) {
        await sock.sendMessage(remoteJid, {
          text: "Seu carrinho está vazio. Digite 1 para ver o cardápio e adicionar itens."
        });
      } else {
        await sock.sendMessage(remoteJid, {
          text: "Opção inválida. Digite 1 para ver o cardápio ou 2 para finalizar o pedido."
        });
      }
      return;
    }

    if (session.step === "categoria") {
      let categoriaSelecionada = null;
      if (normalizedText === "1" || normalizedText.includes("lanche")) {
        categoriaSelecionada = "lanches";
      } else if (normalizedText === "2" || normalizedText.includes("bebida")) {
        categoriaSelecionada = "bebidas";
      }

      if (!categoriaSelecionada) {
        await sock.sendMessage(remoteJid, {
          text: "Categoria inválida. Digite 1 para Lanches ou 2 para Bebidas."
        });
        return;
      }

      session.categoriaAtual = categoriaSelecionada;
      session.step = "cardapio";
      const categoriaItens = categorias[categoriaSelecionada];
      const cardapioText = categoriaItens.map(item => `${item.id} - ${item.nome} - R$ ${item.preco.toFixed(2)}`).join("\n");
      await sock.sendMessage(remoteJid, {
        text: `${categoriaSelecionada.charAt(0).toUpperCase() + categoriaSelecionada.slice(1)}:\n${cardapioText}\n\nDigite o número do item desejado:`
      });
      return;
    }

    if (session.step === "cardapio") {
      const itemId = Number(normalizedText);
      const itemEscolhido = menu.find(item => item.id === itemId);

      if (!itemEscolhido) {
        await sock.sendMessage(remoteJid, {
          text: "Item inválido. Por favor, escolha um item do cardápio." 
        });
        return;
      }

      session.produtoAtual = itemEscolhido;
      session.step = "quantidade";

      await sock.sendMessage(remoteJid, {
        text: `Quantas unidades de ${itemEscolhido.nome} você deseja?`
      });
      return;
    }

    if (session.step === "quantidade") {
      const quantidade = Number(normalizedText);
      if (isNaN(quantidade) || quantidade <= 0) {
        await sock.sendMessage(remoteJid, {
          text: "Quantidade inválida. Digite um número maior que 0."
        });
        return;
      }

      session.carrinho.push({
        produto: session.produtoAtual,
        quantidade
      });
      session.produtoAtual = null;
      session.step = "adicionar_mais";

      await sock.sendMessage(remoteJid, {
        text: `Item adicionado ao carrinho.\nDeseja adicionar mais um item?\n1 - Sim\n2 - Não`
      });
      return;
    }

    if (session.step === "adicionar_mais") {
      if (normalizedText === "1" || normalizedText.includes("sim")) {
        session.step = "categoria";
        await sock.sendMessage(remoteJid, {
          text: "Escolha uma categoria:\n1 - Lanches\n2 - Bebidas\n\nDigite o número da categoria desejada:"
        });
      } else if (normalizedText === "2" || normalizedText.includes("não") || normalizedText.includes("nao")) {
        session.step = "nome";
        if (session.cliente.nome) {
          await sock.sendMessage(remoteJid, {
            text: `Seu nome detectado é ${session.cliente.nome}. Se quiser alterar, digite seu nome agora. Caso contrário, digite 'ok'.`
          });
        } else {
          await sock.sendMessage(remoteJid, {
            text: "Qual é o seu nome?"
          });
        }
      } else {
        await sock.sendMessage(remoteJid, {
          text: "Resposta inválida. Digite 1 para sim ou 2 para não."
        });
      }
      return;
    }

    if (session.step === "nome") {
      if (normalizedText === "ok" && session.cliente.nome) {
        session.step = "endereco";
        await sock.sendMessage(remoteJid, {
          text: "Por favor, informe seu endereço completo (rua, número, bairro, cidade)."
        });
        return;
      }

      session.cliente.nome = text.trim();
      session.step = "endereco";
      await sock.sendMessage(remoteJid, {
        text: "Obrigado. Agora, informe seu endereço completo (rua, número, bairro, cidade)."
      });
      return;
    }

    if (session.step === "endereco") {
      session.endereco = buildAddress(text);
      session.step = "pagamento";

      await sock.sendMessage(remoteJid, {
        text: "Qual a forma de pagamento?\n1 - Pix\n2 - Cartão de crédito/débito\n3 - Dinheiro"
      });
      return;
    }

    if (session.step === "pagamento") {
      let metodo = null;
      if (normalizedText === "1" || normalizedText.includes("pix")) {
        metodo = "Pix";
      } else if (normalizedText === "2" || normalizedText.includes("cart")) {
        metodo = "Cartão de crédito/débito";
      } else if (normalizedText === "3" || normalizedText.includes("dinheiro")) {
        metodo = "Dinheiro";
      }

      if (!metodo) {
        await sock.sendMessage(remoteJid, {
          text: "Forma de pagamento inválida. Digite 1, 2 ou 3."
        });
        return;
      }

      session.pagamento.metodo = metodo;
      session.step = "resumo";

      await sock.sendMessage(remoteJid, {
        text: `${formatOrderSummary(session)}\n\nDigite 1 para confirmar o pedido ou 2 para cancelar.`
      });
      return;
    }

    if (session.step === "resumo") {
      if (normalizedText === "1" || normalizedText.includes("confirmar")) {
        const backendResponse = await sendOrderToBackend(session);
        session.step = "concluido";
        await sock.sendMessage(remoteJid, {
          text: `Pedido confirmado! Agora vamos seguir com a preparação. Em breve entraremos em contato.`
        });
        delete userSessions[remoteJid];
      } else if (normalizedText === "2" || normalizedText.includes("cancelar")) {
        await sock.sendMessage(remoteJid, {
          text: "Pedido cancelado. Digite qualquer mensagem para iniciar um novo pedido."
        });
        delete userSessions[remoteJid];
      } else {
        await sock.sendMessage(remoteJid, {
          text: "Digite 1 para confirmar ou 2 para cancelar."
        });
      }
      return;
    }

    await sock.sendMessage(remoteJid, {
      text: "Não Reconheço este comando. Digite qualquer mensagem para iniciar um novo pedido."
    });
  } catch (error) {
    console.error("Erro ao processar mensagem:", error);
    try {
      await sock.sendMessage(remoteJid, {
        text: "Desculpe, ocorreu um erro. Tente novamente mais tarde."
      });
    } catch (sendError) {
      console.error("Erro ao enviar mensagem de erro:", sendError);
    }
  }
}

module.exports = {
  handleMessage
};