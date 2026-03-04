# Vortexys — Sistema de Gestão (White-Label)

ERP + CRM + Financeiro em Docker. Uma VM por cliente.

## Stack
- **Frontend:** React + Vite (build estático no nginx)
- **Backend:** Node.js + Express + JWT
- **Banco:** PostgreSQL 16
- **Proxy:** Nginx

## Módulos
- 📦 Produtos & Estoque
- 🔄 Movimentações de estoque
- 🛒 Pedidos de venda
- 👥 Clientes & Fornecedores
- 🎯 CRM com funil Kanban
- 💰 Financeiro (contas a pagar/receber)
- ⚙️ Gestão de usuários

---

## Deploy (novo cliente)

### 1. Copie o projeto para a VM
```bash
git clone <repo> /opt/vortexys
cd /opt/vortexys
```

### 2. Configure o .env
```bash
cp .env.example .env
nano .env
```

Edite os valores:
```env
# Banco
DB_PASSWORD=senha_segura_aqui

# JWT - MUDE ISSO!
JWT_SECRET=string_aleatoria_longa_aqui

# White-label
VITE_COMPANY_NAME=Nome do Cliente
VITE_PRIMARY_COLOR=#b44fff
VITE_SECONDARY_COLOR=#ff6b2b
VITE_LOGO_URL=https://urldomeulogo.com/logo.png

# Admin inicial
ADMIN_EMAIL=admin@cliente.com
ADMIN_PASSWORD=senha_forte_aqui
```

### 3. Sobe tudo
```bash
chmod +x deploy.sh
./deploy.sh
```

Acesse: `http://IP_DA_VM`

---

## Comandos úteis

```bash
# Logs em tempo real
docker compose logs -f

# Restart só do backend
docker compose restart backend

# Acessar banco direto
docker exec -it vrx-db psql -U vortexys

# Backup do banco
docker exec vrx-db pg_dump -U vortexys vortexys > backup_$(date +%Y%m%d).sql

# Restaurar backup
docker exec -i vrx-db psql -U vortexys vortexys < backup.sql

# Parar tudo
docker compose down

# Parar e apagar banco (CUIDADO!)
docker compose down -v
```

---

## White-label

Tudo é configurado via `.env` **antes** de buildar:

| Variável | Descrição |
|---|---|
| `VITE_COMPANY_NAME` | Nome que aparece na sidebar e login |
| `VITE_PRIMARY_COLOR` | Cor principal (botões, destaques) |
| `VITE_SECONDARY_COLOR` | Cor secundária (gradiente) |
| `VITE_LOGO_URL` | URL do logo (PNG/SVG). Vazio = ícone padrão |

Para **atualizar** a identidade visual, basta editar o `.env` e rodar `./deploy.sh` novamente.

---

## Usuário padrão
- Email: definido em `ADMIN_EMAIL`
- Senha: definida em `ADMIN_PASSWORD`

Troque a senha pelo painel em **Configurações → Alterar senha** após o primeiro login.

---

## Estrutura de arquivos
```
vortexys/
├── docker-compose.yml
├── .env.example
├── deploy.sh
├── nginx/
│   └── nginx.conf
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── server.js
│       ├── middleware/auth.js
│       ├── database/
│       │   ├── db.js
│       │   └── init.sql
│       └── routes/
│           ├── auth.js, users.js
│           ├── products.js, stock.js
│           ├── orders.js, clients.js
│           ├── leads.js, pipelines.js, activities.js
│           ├── transactions.js, categories.js
│           └── dashboard.js
└── frontend/
    ├── Dockerfile
    ├── vite.config.js
    └── src/
        ├── App.jsx, main.jsx
        ├── contexts/  (Auth, Theme)
        ├── services/  (api.js)
        ├── components/ (Layout, UI)
        └── pages/
            ├── Login, Dashboard
            ├── Products, Stock, Orders
            ├── Clients, CRM, Financial
            └── Settings
```
