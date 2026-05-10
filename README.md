# WhatsApp Delivery Chatbot

Sistema de chatbot para restaurantes que recebem pedidos via WhatsApp e gerenciam tudo em um painel web.

## Funcionalidades

- Recebimento de pedidos via WhatsApp
- Processamento automático de mensagens
- Armazenamento em PostgreSQL
- Painel web para pedidos e analytics
- Área administrativa multiempresa e multiloja

## Tecnologias

- Node.js
- Express
- Baileys
- PostgreSQL
- React + Vite

## Rodando o backend localmente

```bash
npm install
npm run dev
```

## Variáveis do backend

O backend aceita duas formas de configuração do banco.

### 1. Variáveis separadas

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=delivery_chatbot
DB_USER=postgres
DB_PASSWORD=sua_senha
DB_SSL_MODE=disable
```

### 2. URL única

```env
DATABASE_URL=postgresql://user:password@host:5432/database
DB_SSL_MODE=require
```

### Variáveis adicionais

```env
PORT=3000
JWT_SECRET=sua_chave_forte
CORS_ORIGIN=http://localhost:5173
WHATSAPP_AUTO_START=false
```

`CORS_ORIGIN` aceita múltiplas origens separadas por vírgula.

## Deploy do backend na Railway

No serviço do backend, configure:

```env
PORT=3000
JWT_SECRET=sua_chave_forte
CORS_ORIGIN=https://seu-frontend.com
DATABASE_URL=${{Postgres.DATABASE_URL}}
DB_SSL_MODE=require
WHATSAPP_AUTO_START=false
```

Se preferir usar as variáveis separadas da Railway:

```env
DB_HOST=${{Postgres.PGHOST}}
DB_PORT=${{Postgres.PGPORT}}
DB_NAME=${{Postgres.PGDATABASE}}
DB_USER=${{Postgres.PGUSER}}
DB_PASSWORD=${{Postgres.PGPASSWORD}}
DB_SSL_MODE=require
```

Se o serviço do banco não se chama `Postgres`, troque o nome da referência.

## Rotas úteis para produção

- `GET /`
- `GET /health`

## Frontend no Vercel

No projeto do Vercel, configure:

```env
VITE_API_URL=https://seu-backend.up.railway.app
```

No backend da Railway, configure `CORS_ORIGIN` com o domínio do Vercel:

```env
CORS_ORIGIN=https://seu-frontend.vercel.app
```

Se usar domínio próprio no frontend, adicione esse domínio também. Para múltiplas origens:

```env
CORS_ORIGIN=https://seu-frontend.vercel.app,https://app.seudominio.com
```

## Primeiro acesso

Após iniciar a API, use a conta master já existente no banco ou conclua o bootstrap inicial do sistema, conforme o estado atual da base.
