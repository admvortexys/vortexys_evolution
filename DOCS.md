# Documentação técnica — Vortexys

Documentação completa do sistema, arquivo por arquivo.

---

## Índice

1. [Visão geral](#1-visão-geral)
2. [Raiz do projeto](#2-raiz-do-projeto)
3. [Backend](#3-backend)
4. [Frontend](#4-frontend)
5. [Infraestrutura](#5-infraestrutura)

---

## 1. Visão geral

O Vortexys é um sistema de gestão empresarial (ERP + CRM + Financeiro) com integração WhatsApp. A arquitetura é **white-label**: cada cliente recebe uma instância Docker própria, com identidade visual customizável.

### Fluxo de dados

```
[Browser] → Nginx (porta 80) → /api → Backend (Node/Express)
                                /   → Frontend (React estático)
                                /ws → WebSocket (WhatsApp real-time)
```

### Autenticação

- **JWT** no header `Authorization: Bearer <token>`
- Token armazenado em `localStorage` (`vrx_token`)
- Em 401, o interceptor do axios redireciona para `/login`
- Permissões por módulo em `user.permissions` (RBAC)

---

## 2. Raiz do projeto

| Arquivo | Descrição |
|---------|-----------|
| **README.md** | Guia de deploy e visão geral do sistema |
| **DOCS.md** | Esta documentação detalhada |
| **deploy.sh** | Script de deploy: valida .env, builda imagens, sobe containers. Suporta `--cliente`, `--porta`, `--no-cache` |
| **docker-compose.yml** | Define serviços: postgres, redis, evolution-api, backend, frontend, nginx |
| **.env.example** | Template de variáveis de ambiente. Copiar para `.env` antes do deploy |
| **.gitignore** | Arquivos e pastas ignorados pelo Git |

---

## 3. Backend

### 3.1 Estrutura

```
backend/
├── Dockerfile
├── package.json
└── src/
    ├── server.js           # Entry point
    ├── config/env.js       # Validação de variáveis de ambiente
    ├── database/
    │   ├── db.js           # Pool PostgreSQL
    │   └── schema.sql      # Schema + migrações (executado no boot)
    ├── middleware/
    │   ├── auth.js         # JWT + usuário
    │   ├── rbac.js         # Roles e permissões
    │   ├── validate.js     # Validação de body (Zod)
    │   ├── audit.js        # Auditoria de alterações
    │   └── errorHandler.js # Tratamento de erros
    ├── routes/             # Rotas da API
    └── services/
        ├── evolutionApi.js # Cliente Evolution API (WhatsApp)
        ├── botEngine.js    # Lógica do bot de atendimento
        └── wsServer.js     # WebSocket para real-time
```

---

### 3.2 server.js

Entry point do backend. Configura Express, middlewares, rotas e inicia o servidor HTTP.

- **Helmet, CORS, cookie-parser, rate-limit**
- **Rotas**: `/api/auth`, `/api/users`, `/api/products`, etc.
- **Health**: `GET /api/health` — verifica conectividade com o banco
- **Migrations**: lê `schema.sql` e executa comandos no boot
- **Seed admin**: cria usuário admin no primeiro boot (credenciais do .env)
- **WebSocket**: integrado ao servidor HTTP para canal `/ws`

---

### 3.3 config/env.js

Valida variáveis de ambiente com Zod antes do servidor subir. Variáveis obrigatórias: `JWT_SECRET`, `DB_PASSWORD`. Opcionais: `PORT`, `ALLOWED_ORIGIN`, `EVOLUTION_API_URL`, etc. Falha com mensagem clara se algo estiver inválido.

---

### 3.4 database/db.js

Pool de conexão PostgreSQL usando `pg`. Exporta `db.query()`. Usado em todas as rotas e services.

---

### 3.5 database/schema.sql

Schema completo do banco. Idempotente (IF NOT EXISTS). Principais tabelas:

| Tabela | Descrição |
|--------|-----------|
| **settings** | Chave/valor para configurações (tema, templates WA, etc.) |
| **users** | Usuários, senha, role, permissions (JSONB) |
| **categories** | Categorias de produtos |
| **warehouses** | Almoxarifados |
| **products** | Produtos (SKU, preços, estoque, imagem base64) |
| **stock_movements** | Histórico de movimentações |
| **clients** | Clientes e fornecedores |
| **sellers** | Vendedores (comissão, metas) |
| **orders** | Pedidos de venda |
| **order_items** | Itens dos pedidos |
| **order_statuses** | Status customizáveis (slug, label, color) |
| **leads** | Leads do CRM |
| **pipelines** | Funis do CRM |
| **activities** | Atividades/tarefas de leads |
| **transactions** | Transações financeiras |
| **financial_categories** | Categorias de receita/despesa |
| **financial_accounts** | Contas bancárias/caixa |
| **service_orders** | Ordens de serviço |
| **service_order_items** | Itens das OS |
| **wa_conversations** | Conversas WhatsApp |
| **wa_messages** | Mensagens WhatsApp |
| **wa_departments** | Departamentos WhatsApp |
| **wa_bot_configs** | Config do bot |
| **automation_rules** | Regras de automação CRM |

---

### 3.6 middleware/auth.js

Middleware que valida o JWT e carrega o usuário. Lê token de `Authorization: Bearer` ou cookie `access_token`. Se inválido ou expirado, retorna 401. Preenche `req.user`.

---

### 3.7 middleware/rbac.js

- **requireRole(...roles)**: exige que `req.user.role` esteja na lista
- **requirePermission(module, action)**: admin passa sempre; outros precisam de `user.permissions[module]`. Action `'write'` exige permissão explícita de escrita.

---

### 3.8 middleware/validate.js

Validação de body/query com Zod. Usado em rotas que exigem schemas específicos.

---

### 3.9 middleware/errorHandler.js

Captura erros não tratados, loga e retorna resposta padronizada com status e mensagem.

---

### 3.10 middleware/audit.js

Registra alterações (criar/atualizar/deletar) em tabelas auditáveis.

---

### 3.11 Rotas (routes/)

| Arquivo | Base | Descrição |
|---------|------|-----------|
| **auth.js** | `/api/auth` | Login (JWT), logout, troca de senha |
| **users.js** | `/api/users` | CRUD usuários, permissões, reset de senha |
| **products.js** | `/api/products` | CRUD produtos, unidades (IMEI) |
| **stock.js** | `/api/stock` | Movimentações, entrada/saída/ajuste |
| **orders.js** | `/api/orders` | CRUD pedidos, itens, pagamentos |
| **orderStatuses.js** | `/api/order-statuses` | Status de pedido customizáveis |
| **credits.js** | `/api/credits` | Créditos/adiantamentos |
| **returns.js** | `/api/returns` | Devoluções vinculadas a pedidos |
| **clients.js** | `/api/clients` | CRUD clientes e fornecedores |
| **sellers.js** | `/api/sellers` | CRUD vendedores |
| **leads.js** | `/api/leads` | CRUD leads, kanban |
| **pipelines.js** | `/api/pipelines` | Funis do CRM |
| **activities.js** | `/api/activities` | Atividades de leads |
| **transactions.js** | `/api/transactions` | Transações financeiras, resumo, por categoria |
| **categories.js** | `/api/categories` | Categorias de produtos |
| **dashboard.js** | `/api/dashboard` | KPIs, BI (geral, vendedores, produtos, clientes, CRM). Filtros por mês, data ou período |
| **serviceOrders.js** | `/api/service-orders` | Ordens de serviço, templates WA |
| **whatsapp.js** | `/api/whatsapp` | Instâncias, conversas, mensagens, webhook Evolution |
| **reports.js** | `/api/reports` | Relatórios diversos |
| **proposals.js** | `/api/proposals` | Propostas comerciais |
| **automations.js** | `/api/automations` | Regras de automação CRM |
| **settings.js** | `/api/settings` | Tema white-label: GET/PUT `/theme` |
| **publicOs.js** | `/api/public` | Portal público de OS (por token) |

---

### 3.12 services/evolutionApi.js

Cliente da Evolution API. Funções para criar instância, conectar, enviar mensagens, etc. Usado por `whatsapp.js`.

---

### 3.13 services/botEngine.js

Lógica do bot de atendimento. Processa mensagens entrantes, consulta `wa_bot_configs` e gera respostas (incluindo via LLM quando configurado).

---

### 3.14 services/wsServer.js

Servidor WebSocket. Usado para enviar mensagens em tempo real ao frontend (ex.: novas mensagens WhatsApp).

---

## 4. Frontend

### 4.1 Estrutura

```
frontend/
├── Dockerfile
├── index.html
├── package.json
├── vite.config.js
└── src/
    ├── main.jsx          # Entry, renderiza App
    ├── App.jsx           # Rotas, providers
    ├── index.css         # Variáveis CSS globais
    ├── contexts/
    │   ├── AuthContext.jsx
    │   ├── ThemeContext.jsx
    │   └── ToastContext.jsx
    ├── services/
    │   └── api.js        # Cliente Axios
    ├── components/
    │   ├── Layout.jsx    # Sidebar + outlet
    │   ├── UI.jsx        # Componentes reutilizáveis
    │   └── ErrorBoundary.jsx
    └── pages/
        ├── Login.jsx
        ├── ChangePassword.jsx
        ├── Dashboard.jsx
        ├── Products.jsx
        ├── Stock.jsx
        ├── Orders.jsx
        ├── Credits.jsx
        ├── Returns.jsx
        ├── Clients.jsx
        ├── Sellers.jsx
        ├── CRM.jsx
        ├── Proposals.jsx
        ├── Calendar.jsx
        ├── ServiceOrders.jsx
        ├── WhatsApp.jsx
        ├── Financial.jsx
        ├── Settings.jsx
        ├── Reports.jsx
        └── OsPortal.jsx
```

---

### 4.2 main.jsx

Entry do React. Renderiza `App` dentro de `React.StrictMode` e `ErrorBoundary`.

---

### 4.3 App.jsx

- **Providers**: ThemeProvider, AuthProvider, ToastProvider
- **Rotas públicas**: `/login`, `/change-password`, `/os/:number` (portal OS)
- **Rotas protegidas**: Layout + Outlet com todas as páginas do sistema
- **SmartRedirect**: na raiz `/`, redireciona para Dashboard ou primeiro módulo com permissão

---

### 4.4 index.css

Variáveis CSS (`--primary`, `--secondary`, `--bg`, `--text`, `--muted`, etc.), estilos base e utilitários.

---

### 4.5 contexts/AuthContext.jsx

- **user**: estado do usuário logado (localStorage ao carregar)
- **login(identifier, password)**: chama `/auth/login`, salva token e user no localStorage
- **logout**: limpa token/user, opcionalmente chama `/auth/logout`
- **setUser**: atualiza o usuário (ex.: após troca de senha)

---

### 4.6 contexts/ThemeContext.jsx

- Carrega tema de `GET /api/settings/theme` (nome, cores, logo)
- **applyTheme(data)**: define variáveis CSS (`--primary`, `--grad`, etc.) e atualiza estado
- **refreshTheme(data?)**: se `data` informado, aplica; senão, faz fetch e aplica
- **company, logoUrl, primary, secondary**: valores atuais do tema

---

### 4.7 contexts/ToastContext.jsx

- **toast.success(msg)**, **toast.error(msg)**: exibe notificação temporária
- **toast.confirm(options)**: confirmação com callback

---

### 4.8 services/api.js

Cliente Axios configurado com `baseURL` (VITE_API_URL ou `/api`). Interceptor de request adiciona `Authorization: Bearer <token>`. Interceptor de response: em 401, redireciona para `/login`.

---

### 4.9 components/Layout.jsx

- Sidebar com logo, menu por grupos (Principal, Vendas, Pessoas, CRM, etc.), usuário e botão Recolher
- Grupos colapsáveis; sidebar expandida por padrão
- NavLink para cada rota; itens filtrados por `user.permissions`
- Outlet para o conteúdo da página

---

### 4.10 components/UI.jsx

Componentes reutilizáveis: `PageHeader`, `Card`, `Table`, `Btn`, `Input`, `Select`, `Modal`, `Badge`, `Spinner`, `Autocomplete`, `fmt` (formatação BRL, num), etc.

---

### 4.11 components/ErrorBoundary.jsx

Captura erros de renderização em componentes filhos e exibe fallback em vez de quebrar a aplicação.

---

### 4.12 Páginas (pages/)

| Arquivo | Rota | Descrição |
|---------|------|-----------|
| **Login.jsx** | `/login` | Tela de login com usuário/senha |
| **ChangePassword.jsx** | `/change-password` | Troca obrigatória de senha no primeiro acesso |
| **Dashboard.jsx** | `/` | BI com abas: Geral, Financeiro, Vendedores, Produtos, Clientes, CRM. Filtros (mês/data/período) e exportação XLSX |
| **Products.jsx** | `/products` | CRUD produtos, categorias, estoque baixo |
| **Stock.jsx** | `/stock` | Movimentações, entrada/saída, ajustes |
| **Orders.jsx** | `/orders` | Pedidos, itens, status, pagamentos |
| **Credits.jsx** | `/credits` | Créditos/adiantamentos |
| **Returns.jsx** | `/returns` | Devoluções |
| **Clients.jsx** | `/clients` | Cadastro de clientes |
| **Sellers.jsx** | `/sellers` | Cadastro de vendedores |
| **CRM.jsx** | `/crm` | Kanban de leads, pipelines, atividades |
| **Proposals.jsx** | `/proposals` | Propostas comerciais |
| **Calendar.jsx** | `/calendar` | Agenda de compromissos |
| **ServiceOrders.jsx** | `/service-orders` | Ordens de serviço (reparos) |
| **WhatsApp.jsx** | `/whatsapp` | Chat, conversas, instâncias Evolution |
| **Financial.jsx** | `/financial` | Transações, fontes de receita, categorias |
| **Settings.jsx** | `/settings` | Usuários, permissões, identidade visual |
| **Reports.jsx** | Embed no CRM | Relatórios (redireciona para `/?tab=crm`) |
| **OsPortal.jsx** | `/os/:number` | Portal público para cliente acompanhar OS (por token) |

---

## 5. Infraestrutura

### 5.1 nginx/nginx.conf

- **Porta 80**: recebe todo o tráfego
- **/ws**: proxy para WebSocket do backend
- **/api/auth/login**: rate limit restrito (login)
- **/api/whatsapp/webhook/**: rate limit moderado
- **/api**: proxy para backend (Node)
- **/**: proxy para frontend (app estático)

### 5.2 docker-compose.yml

| Serviço | Imagem | Descrição |
|---------|--------|-----------|
| **postgres** | postgres:16-alpine | Banco de dados |
| **redis** | redis:7-alpine | Cache e filas Evolution |
| **evolution-api** | evoapicloud/evolution-api | API WhatsApp |
| **backend** | build ./backend | API Node.js |
| **frontend** | build ./frontend | App React (servido por nginx no container) |
| **nginx** | nginx:alpine | Proxy reverso, porta 80 |

### 5.3 deploy.sh

Valida variáveis obrigatórias do `.env`, executa `docker compose build` e `docker compose up -d`, exibe URL de acesso e logs.

---

## Resumo de integrações

| Componente | Integra com |
|------------|-------------|
| Frontend | Backend via Axios (`/api`) |
| Backend | PostgreSQL, Evolution API, Redis (via Evolution) |
| Evolution API | WhatsApp Web, PostgreSQL, Redis |
| Nginx | Frontend (static), Backend (API + WS) |
