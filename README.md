# 🤖 BaileyBot V2

Sistema web para gerenciamento de clientes e envio de mensagens pelo WhatsApp utilizando **Baileys**, **Express**, **Socket.IO** e **SQLite**.

> Projeto desenvolvido para uso interno da Refricom Refrigeração.

---

## 🚀 Tecnologias

- Node.js
- Express
- Socket.IO
- Baileys
- SQLite (better-sqlite3)
- Bootstrap 5
- JavaScript (ES Modules)

---

## 📂 Estrutura do Projeto

```
src/
│
├── config/
├── controllers/
├── database/
├── middleware/
├── public/
│   ├── css/
│   ├── img/
│   ├── js/
│   └── index.html
├── routes/
├── server/
├── services/
├── sockets/
└── utils/
```

---

## ✨ Funcionalidades

- [x] Interface Web responsiva
- [x] Dashboard
- [x] Cadastro de clientes
- [x] Banco SQLite
- [x] Conexão com WhatsApp
- [x] QR Code na interface
- [x] Envio individual de mensagens
- [x] Campanhas com seleção de destinatários, histórico e reenvio de falhas
- [x] Templates de mensagens
- [x] Histórico com filtros e paginação
- [x] Backup do banco nas configurações
- [x] Comissões: técnicos, importação OG1, saldos e solicitações de crédito

---

## ▶️ Como executar

### Instalar dependências

```bash
npm install
```

### Iniciar o projeto

```bash
npm run dev
```

Abra:

```
http://localhost:3000
```

## Configuração opcional

Crie ou ajuste o arquivo `.env`:

```env
PORT=3000
CAMPAIGN_DELAY_MS=1500
```

O intervalo reduz disparos consecutivos muito rápidos. No módulo Comissões, cadastre primeiro os técnicos com o mesmo código usado no relatório do OG1; depois importe o arquivo de vendas.

---

## 📌 Roadmap

### V1 operacional
- [x] Clientes, dashboard e banco SQLite
- [x] WhatsApp via Baileys
- [x] Templates, envio individual e histórico
- [x] Campanhas completas
- [x] Backup e diagnóstico da instalação

---

# BaileyBot V2

![Dashboard](docs/dashboard.png)

## 👨‍💻 Autor

Desenvolvido por **Joseph Moraes**.
