# Vortexys — Sistema de Gestão Empresarial

ERP + CRM + Financeiro + WhatsApp em Docker. Arquitetura white-label — uma instância por cliente.

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 18 + Vite + Lucide React |
| Backend | Node.js + Express + JWT |
| Banco | PostgreSQL 16 |
| Cache / WS | Redis 7 |
| WhatsApp | Evolution API |
| Proxy | Nginx |

## Módulos

- **Dashboard** — KPIs em tempo real (pedidos, estoque, CRM, financeiro)
- **Produtos** — catálogo com imagens, SKU, código de barras, margem de lucro
- **Estoque** — movimentações (entrada/saída/ajuste) com histórico por produto
- **Pedidos** — fluxo completo com status customizáveis e baixa automática de estoque
- **Clientes** — cadastro de clientes e fornecedores (CPF/CNPJ)
- **Vendedores** — equipe de vendas com metas e comissões
- **CRM** — funil Kanban de leads com pipelines customizáveis
- **WhatsApp** — integração com Evolution API (mensagens, bot, chat interno)
- **Financeiro** — contas a pagar/receber, categorias, recorrências
- **Configurações** — usuários, permissões por módulo, senha

---

## Deploy rápido

### Pré-requisitos

- Docker e Docker Compose instalados
- Porta 80 (ou outra) disponível no servidor

### 1. Clone o repositório

```bash
git clone <repo-url> /opt/vortexys
cd /opt/vortexys
```

### 2. Configure o ambiente

```bash
cp .env.example .env
nano .env     # ou: vim .env
```

Variáveis obrigatórias:

```env
# Banco
DB_PASSWORD=senha_segura_aqui

# JWT — gere com: openssl rand -hex 32
JWT_SECRET=string_aleatoria_longa_minimo_32_chars

# White-label
VITE_COMPANY_NAME=Nome do Cliente
VITE_PRIMARY_COLOR=#a855f7
VITE_SECONDARY_COLOR=#f97316
VITE_LOGO_URL=https://seudominio.com/logo.png   # deixe vazio para usar ícone padrão

# Admin inicial (será forçado a trocar a senha no 1º login)
ADMIN_EMAIL=admin@seucliente.com
ADMIN_PASSWORD=SenhaForte2026!
ADMIN_NAME=Administrador
```

### 3. Suba tudo

```bash
./deploy.sh
```

O script valida o `.env`, builda as imagens, sobe os containers e exibe a URL de acesso.

### Opções do deploy

```bash
./deploy.sh                        # deploy padrão
./deploy.sh --cliente acme         # identifica a instância nos logs
./deploy.sh --porta 8080           # expõe na porta 8080 em vez de 80
./deploy.sh --no-cache             # força rebuild completo das imagens
./deploy.sh --cliente acme --porta 8080 --no-cache
```

---

## Comandos úteis

```bash
# Logs em tempo real
docker compose logs -f

# Logs de um serviço específico
docker compose logs -f backend
docker compose logs -f nginx

# Reiniciar um serviço sem parar os outros
docker compose restart backend
docker compose restart frontend

# Acessar o banco direto
docker exec -it vrx-db psql -U vortexys vortexys

# Backup do banco
docker exec vrx-db pg_dump -U vortexys vortexys > backup_$(date +%Y%m%d_%H%M).sql

# Restaurar backup
docker exec -i vrx-db psql -U vortexys vortexys < backup.sql

# Parar tudo (mantém dados)
docker compose down

# Parar e apagar todos os volumes — CUIDADO: apaga dados!
docker compose down -v

# Atualizar para nova versão
git pull
./deploy.sh --no-cache
```

---

## White-label

Todo o visual é configurado via `.env` antes do build. Para mudar a identidade visual de um cliente basta editar o `.env` e rodar `./deploy.sh --no-cache`.

| Variável | Descrição | Padrão |
|---|---|---|
| `VITE_COMPANY_NAME` | Nome exibido na sidebar e tela de login | `Vortexys` |
| `VITE_PRIMARY_COLOR` | Cor principal (botões, destaques, gradiente) | `#a855f7` |
| `VITE_SECONDARY_COLOR` | Cor secundária do gradiente | `#f97316` |
| `VITE_LOGO_URL` | URL pública do logo (PNG/SVG). Vazio = ícone ⚡ padrão | — |

---

## Usuário administrador

O usuário admin é criado automaticamente no primeiro boot com as credenciais do `.env`.

No primeiro login o sistema força a troca de senha.

Para criar mais usuários: **Configurações → Usuários → + Novo usuário**

---

## Atualização

```bash
git pull origin main
./deploy.sh --no-cache
```

As migrações de banco são executadas automaticamente no boot do backend.

---

## Estrutura do projeto

```
vortexys/
├── deploy.sh              ← script de deploy
├── docker-compose.yml
├── .env.example           ← template de configuração
├── .gitignore
├── nginx/
│   └── nginx.conf
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── server.js
│       ├── database/
│       │   ├── db.js
│       │   ├── init.sql
│       │   └── migrate_v*.sql
│       ├── middleware/
│       │   ├── auth.js
│       │   ├── rbac.js
│       │   ├── audit.js
│       │   └── errorHandler.js
│       ├── routes/
│       │   ├── auth.js, users.js
│       │   ├── products.js, stock.js
│       │   ├── orders.js, orderStatuses.js
│       │   ├── clients.js, sellers.js
│       │   ├── leads.js, pipelines.js, activities.js
│       │   ├── transactions.js, categories.js
│       │   ├── dashboard.js, whatsapp.js
│       └── services/
│           ├── evolutionApi.js
│           ├── botEngine.js
│           └── wsServer.js
└── frontend/
    ├── Dockerfile
    ├── index.html
    ├── package.json
    └── src/
        ├── App.jsx, main.jsx
        ├── index.css
        ├── contexts/
        │   ├── AuthContext.jsx
        │   └── ThemeContext.jsx
        ├── services/
        │   └── api.js
        ├── components/
        │   ├── Layout.jsx
        │   └── UI.jsx
        └── pages/
            ├── Login.jsx, ChangePassword.jsx
            ├── Dashboard.jsx
            ├── Products.jsx, Stock.jsx
            ├── Orders.jsx, Clients.jsx
            ├── Sellers.jsx, CRM.jsx
            ├── Financial.jsx, WhatsApp.jsx
            └── Settings.jsx
```
