# Documentação Técnica — Vortexys

Documentação atualizada da aplicação com foco na arquitetura real do código, fluxos principais, módulos, rotas e operação em Docker.

---

## 1. Visão geral

O Vortexys é um sistema de gestão empresarial com foco em operação comercial e atendimento, combinando:

- ERP de vendas e estoque
- CRM com funil, atividades e agenda
- Financeiro com contas, transações, créditos e devoluções
- Assistência técnica com ordens de serviço e portal público
- WhatsApp integrado via Evolution API
- White-label por instância

O projeto roda em Docker e foi estruturado para subir uma instância completa por cliente, com identidade visual e variáveis de ambiente independentes.

### Stack

| Camada | Tecnologia |
|--------|------------|
| Frontend | React + Vite |
| Backend | Node.js + Express |
| Banco | PostgreSQL 16 |
| Cache / tempo real | Redis + WebSocket |
| WhatsApp | Evolution API |
| Proxy | Nginx |

### Fluxo alto nível

```text
Navegador
  -> Nginx
     -> /api            -> Backend Express
     -> /ws             -> WebSocket autenticado
     -> /               -> Frontend estático

Backend
  -> PostgreSQL         -> dados da aplicação
  -> Redis              -> suporte à Evolution API
  -> Evolution API      -> integração WhatsApp
```

---

## 2. Estado atual da autenticação

O fluxo atual não usa mais token salvo em `localStorage`.

### Sessão web

- `POST /api/auth/login` valida `username` ou `email`
- o backend cria:
  - cookie `access_token` (`HttpOnly`)
  - cookie `vrx_refresh` (`HttpOnly`)
- o frontend mantém apenas o objeto `user` em memória
- em `401`, o cliente Axios tenta `POST /api/auth/refresh`
- se o refresh falhar, o usuário volta para `/login`

### Segurança da sessão

- access token em cookie `HttpOnly`
- refresh token rotativo
- refresh token salvo com hash no banco
- `sameSite: 'strict'`
- `secure` ativado em produção

### Primeiro acesso

Se `force_password_change = true`, o usuário autenticado é redirecionado para `/change-password`.

### Política de senha atual

- mínimo de 8 caracteres
- pelo menos:
  - 1 letra minúscula
  - 1 letra maiúscula
  - 1 número

Arquivos principais:

- [backend/src/routes/auth.js](C:/Users/Matheus/Desktop/vortexys/backend/src/routes/auth.js)
- [backend/src/middleware/auth.js](C:/Users/Matheus/Desktop/vortexys/backend/src/middleware/auth.js)
- [backend/src/utils/passwordPolicy.js](C:/Users/Matheus/Desktop/vortexys/backend/src/utils/passwordPolicy.js)
- [frontend/src/services/api.js](C:/Users/Matheus/Desktop/vortexys/frontend/src/services/api.js)
- [frontend/src/contexts/AuthContext.jsx](C:/Users/Matheus/Desktop/vortexys/frontend/src/contexts/AuthContext.jsx)

---

## 3. Estrutura da raiz do projeto

| Arquivo / pasta | Papel |
|-----------------|-------|
| `README.md` | visão geral e deploy rápido |
| `DOCS.md` | esta documentação |
| `deploy.sh` | deploy guiado, valida `.env`, gera segredos e sobe containers |
| `docker-compose.yml` | orquestra banco, Redis, backend, frontend, Evolution e Nginx |
| `.env.example` | template de variáveis |
| `nginx/` | configuração do proxy reverso |
| `backend/` | API, banco, middleware, serviços |
| `frontend/` | SPA React |

---

## 4. Variáveis de ambiente

As variáveis são validadas em [backend/src/config/env.js](C:/Users/Matheus/Desktop/vortexys/backend/src/config/env.js).

### Obrigatórias na prática

- `JWT_SECRET`
- `DB_PASSWORD`

### Importantes

| Variável | Uso |
|----------|-----|
| `NODE_ENV` | ambiente (`development`, `production`, `test`) |
| `PORT` | porta do backend |
| `ACCESS_TOKEN_EXPIRES_IN` | validade do access token |
| `DATA_ENCRYPTION_KEY` | chave para criptografia de segredos em repouso |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | conexão PostgreSQL |
| `DB_SSL` | SSL no banco |
| `ALLOWED_ORIGIN` | origem permitida no CORS |
| `APP_URL` | URL pública do app, usada também em alguns links |
| `EVOLUTION_API_URL`, `EVOLUTION_API_KEY` | integração WhatsApp |
| `WA_WEBHOOK_SECRET` | validação de webhook |
| `ADMIN_NAME`, `ADMIN_USERNAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | admin inicial |
| `VITE_COMPANY_NAME`, `VITE_PRIMARY_COLOR`, `VITE_SECONDARY_COLOR`, `VITE_LOGO_URL` | defaults white-label |

### Seed do admin

No boot, [backend/src/server.js](C:/Users/Matheus/Desktop/vortexys/backend/src/server.js) tenta criar o admin inicial se:

- `ADMIN_PASSWORD` existir
- a senha atender a política
- ainda não existir usuário com o mesmo email ou username

O `deploy.sh` foi alinhado com essa política e agora:

- exige senha válida no prompt
- ou gera senha válida automaticamente em modo não interativo

---

## 5. Infraestrutura Docker e Nginx

O `docker-compose.yml` sobe:

| Serviço | Container | Papel |
|---------|-----------|-------|
| PostgreSQL | `vrx-db` | banco principal |
| Redis | `vrx-redis` | suporte à Evolution |
| Evolution API | `vrx-evolution` | integração WhatsApp |
| Backend | `vrx-api` | API Express + WebSocket |
| Frontend | `vrx-app` | app React buildado |
| Nginx | `vrx-nginx` | proxy reverso |

### Nginx

[nginx/nginx.conf](C:/Users/Matheus/Desktop/vortexys/nginx/nginx.conf) faz:

- proxy de `/api` para o backend
- proxy de `/ws` para o WebSocket
- proxy do restante para o frontend
- rate limit separado para:
  - login
  - webhook
  - portal público de OS
  - API geral

### Healthcheck

`GET /api/health` executa `SELECT 1` no banco.

---

## 6. Backend

### 6.1 Estrutura

```text
backend/
  Dockerfile
  package.json
  src/
    server.js
    config/
      env.js
    database/
      db.js
      schema.sql
      seed_demo.sql
      seed_bi_showcase.js
    middleware/
      auth.js
      rbac.js
      validate.js
      audit.js
      errorHandler.js
    routes/
      auth.js
      users.js
      products.js
      stock.js
      orders.js
      orderStatuses.js
      credits.js
      returns.js
      clients.js
      sellers.js
      leads.js
      pipelines.js
      activities.js
      transactions.js
      categories.js
      dashboard.js
      serviceOrders.js
      publicOs.js
      whatsapp.js
      reports.js
      proposals.js
      automations.js
      settings.js
    services/
      evolutionApi.js
      botEngine.js
      wsServer.js
      clientMatcher.js
    utils/
      defaultPermissions.js
      discountPermissions.js
      passwordPolicy.js
      security.js
```

### 6.2 Boot do servidor

[backend/src/server.js](C:/Users/Matheus/Desktop/vortexys/backend/src/server.js) faz:

- validação do ambiente
- criação do app Express
- `helmet`, `cors`, `cookie-parser`, `express.json`
- rate limit global
- registro de rotas
- endpoint `/api/health`
- leitura e execução de `schema.sql`
- migrations de segurança em runtime
- seed do admin
- acoplamento do WebSocket no mesmo servidor HTTP

### 6.3 Banco e migrations

[backend/src/database/schema.sql](C:/Users/Matheus/Desktop/vortexys/backend/src/database/schema.sql) é o schema principal e também funciona como base de migração idempotente.

O parser de `server.js` suporta blocos:

- `DO $$ ... $$;`
- `CREATE FUNCTION ... AS $$ ... $$ LANGUAGE plpgsql;`

### 6.4 Segurança no backend

[backend/src/utils/security.js](C:/Users/Matheus/Desktop/vortexys/backend/src/utils/security.js) centraliza:

- geração de token opaco
- hash SHA-256 de tokens
- criptografia AES-256-GCM para segredos em repouso
- detecção de valores já criptografados

Hoje isso é usado principalmente para:

- refresh tokens
- `device_password` das ordens de serviço

### 6.5 Conexão com banco

[backend/src/database/db.js](C:/Users/Matheus/Desktop/vortexys/backend/src/database/db.js):

- cria pool PostgreSQL
- trata `TIMESTAMP` sem timezone como string local
- usa `rejectUnauthorized` em produção quando SSL estiver ativo

### 6.6 Middlewares

| Arquivo | Função |
|---------|--------|
| `auth.js` | autentica por Bearer ou cookie `access_token` |
| `rbac.js` | valida papel e permissões por módulo |
| `validate.js` | schemas Zod para body/query em rotas específicas |
| `audit.js` | apoio a auditoria |
| `errorHandler.js` | tratamento padrão de erro |

### 6.7 Permissões

[backend/src/utils/defaultPermissions.js](C:/Users/Matheus/Desktop/vortexys/backend/src/utils/defaultPermissions.js) define o baseline atual com mínimo privilégio.

Módulos atuais:

- `dashboard`
- `pdv`
- `products`
- `stock`
- `orders`
- `returns`
- `client_credits`
- `clients`
- `suppliers`
- `sellers`
- `crm`
- `calendar`
- `service_orders`
- `financial`
- `cash_flow_projection`
- `whatsapp`
- `settings`

Campos especiais:

- `can_authorize_discount`
- `discount_limit_pct`

### 6.8 Rotas principais

| Base | Arquivo | Responsabilidade |
|------|---------|------------------|
| `/api/auth` | `auth.js` | login, refresh, logout, `me`, troca de senha, autorização de desconto |
| `/api/users` | `users.js` | CRUD de usuários, permissões e reset de senha |
| `/api/products` | `products.js` | catálogo, unidades e dados de produto |
| `/api/stock` | `stock.js` | entradas, saídas, ajustes e painéis de estoque |
| `/api/orders` | `orders.js` | pedidos, itens, pagamentos, descontos e usuário responsável |
| `/api/order-statuses` | `orderStatuses.js` | status customizáveis de pedido |
| `/api/credits` | `credits.js` | créditos de cliente |
| `/api/returns` | `returns.js` | devoluções e documentos vinculados |
| `/api/clients` | `clients.js` | clientes e fornecedores |
| `/api/sellers` | `sellers.js` | vendedores |
| `/api/leads` | `leads.js` | leads do CRM |
| `/api/pipelines` | `pipelines.js` | funis |
| `/api/activities` | `activities.js` | agenda e atividades |
| `/api/transactions` | `transactions.js` | financeiro e agregações |
| `/api/categories` | `categories.js` | categorias de produto e financeiras auxiliares |
| `/api/dashboard` | `dashboard.js` | KPIs e BI |
| `/api/service-orders` | `serviceOrders.js` | assistência técnica, itens, checklist, WhatsApp, portal |
| `/api/public` | `publicOs.js` | portal público da OS |
| `/api/whatsapp` | `whatsapp.js` | conversas, mensagens, instâncias e webhook |
| `/api/reports` | `reports.js` | relatórios |
| `/api/proposals` | `proposals.js` | propostas comerciais |
| `/api/automations` | `automations.js` | automações |
| `/api/settings` | `settings.js` | tema white-label e configurações |

### 6.9 Fluxos de backend mais importantes

#### Auth

[backend/src/routes/auth.js](C:/Users/Matheus/Desktop/vortexys/backend/src/routes/auth.js):

- `POST /login`
- `POST /refresh`
- `POST /logout`
- `GET /me`
- `POST /change-password`
- `POST /discount-approval`

#### Pedidos

[backend/src/routes/orders.js](C:/Users/Matheus/Desktop/vortexys/backend/src/routes/orders.js) hoje inclui:

- vínculo com usuário criador
- histórico de aprovação de desconto acima do limite
- persistência do aprovador, percentual e data da aprovação

#### Assistência técnica

[backend/src/routes/serviceOrders.js](C:/Users/Matheus/Desktop/vortexys/backend/src/routes/serviceOrders.js) cobre:

- CRUD de OS
- itens de orçamento
- checklist
- mensagens de WhatsApp
- portal do cliente
- criptografia de `device_password`
- rotação de `portal_token` curto

#### Portal público de OS

[backend/src/routes/publicOs.js](C:/Users/Matheus/Desktop/vortexys/backend/src/routes/publicOs.js):

- endpoint público por token
- rate limit dedicado
- validação de token hexadecimal forte
- retorno resumido para acompanhamento do cliente

### 6.10 Services

| Arquivo | Papel |
|---------|-------|
| `evolutionApi.js` | cliente HTTP da Evolution API |
| `botEngine.js` | regras do bot de atendimento |
| `wsServer.js` | servidor WebSocket autenticado |
| `clientMatcher.js` | apoio para associação de contatos/clientes |

### 6.11 WebSocket

[backend/src/services/wsServer.js](C:/Users/Matheus/Desktop/vortexys/backend/src/services/wsServer.js):

- path `/ws`
- autenticação por cookie `access_token`
- fallback compatível com subprotocol bearer
- validação de `Origin`
- rooms:
  - `inbox`
  - `conversation:{id}`

---

## 7. Banco de dados

O schema é grande; abaixo estão as entidades mais importantes para entender o sistema.

### Núcleo

| Tabela | Uso |
|--------|-----|
| `settings` | chave/valor de configuração |
| `users` | usuários, papéis, permissões, senha |
| `refresh_tokens` | refresh token hasheado |

### Comercial

| Tabela | Uso |
|--------|-----|
| `products` | produtos |
| `product_units` | unidades individuais, IMEI/serial |
| `stock_movements` | movimentações |
| `warehouses` | depósitos |
| `orders` | pedidos |
| `order_items` | itens do pedido |
| `order_statuses` | status de pedido |
| `returns` | devoluções |
| `credits` | créditos do cliente |

### Cadastro

| Tabela | Uso |
|--------|-----|
| `clients` | clientes e fornecedores |
| `sellers` | vendedores |
| `categories` | categorias |
| `financial_categories` | categorias financeiras |
| `financial_accounts` | contas bancárias/caixa |

### CRM

| Tabela | Uso |
|--------|-----|
| `leads` | leads |
| `pipelines` | funis |
| `activities` | atividades |
| `automations` / relacionadas | automações do CRM |

### Financeiro

| Tabela | Uso |
|--------|-----|
| `transactions` | receitas, despesas, transferências |
| `recurring_transactions` / estruturas relacionadas | recorrências e projeções |

### Assistência técnica

| Tabela | Uso |
|--------|-----|
| `service_orders` | ordem principal |
| `service_order_devices` | dados do aparelho |
| `service_order_items` | orçamento |
| `service_order_checklists` | checklist por OS |
| `service_checklist_templates` | checklist padrão |
| `service_services` | catálogo de serviços |
| `service_order_logs` | histórico |

### WhatsApp

| Tabela | Uso |
|--------|-----|
| `wa_instances` | instâncias conectadas |
| `wa_conversations` | conversas |
| `wa_messages` | mensagens |
| `wa_quick_replies` | atalhos |
| `wa_tags` | tags |
| `wa_departments` | departamentos |
| `wa_bot_configs` | configuração do bot |

---

## 8. Frontend

### 8.1 Estrutura

```text
frontend/
  Dockerfile
  package.json
  index.html
  vite.config.js
  src/
    main.jsx
    App.jsx
    index.css
    services/
      api.js
    contexts/
      AuthContext.jsx
      ThemeContext.jsx
      ToastContext.jsx
    components/
      Layout.jsx
      UI.jsx
      ErrorBoundary.jsx
      WarehouseManager.jsx
      dashboard/
      stock/
    pages/
      Login.jsx
      ChangePassword.jsx
      Dashboard.jsx
      Products.jsx
      Stock.jsx
      Orders.jsx
      PDV.jsx
      Credits.jsx
      ClientCredits.jsx
      Returns.jsx
      Clients.jsx
      Fornecedores.jsx
      Sellers.jsx
      CRM.jsx
      Calendar.jsx
      ServiceOrders.jsx
      Financial.jsx
      CashFlowProjection.jsx
      WhatsApp.jsx
      Settings.jsx
      OsPortal.jsx
      Reports.jsx
```

### 8.2 Providers

[frontend/src/App.jsx](C:/Users/Matheus/Desktop/vortexys/frontend/src/App.jsx) monta:

- `ThemeProvider`
- `AuthProvider`
- `ToastProvider`
- `BrowserRouter`

### 8.3 Rotas públicas

- `/login`
- `/change-password`
- `/os/:number`

### 8.4 Rotas protegidas

Todas as demais passam por:

- `Protected`
- `RequireModule`
- `Layout`

### 8.5 Módulos de tela

| Rota | Arquivo | Uso |
|------|---------|-----|
| `/` | `Dashboard.jsx` | BI principal |
| `/pdv` | `PDV.jsx` | operação rápida de venda |
| `/products` | `Products.jsx` | catálogo |
| `/stock` | `Stock.jsx` | estoque |
| `/orders` | `Orders.jsx` | pedidos |
| `/returns` | `Returns.jsx` | devoluções |
| `/credits` | `Credits.jsx` | créditos gerais |
| `/client-credits` | `ClientCredits.jsx` | créditos por cliente |
| `/clients` | `Clients.jsx` | clientes |
| `/fornecedores` | `Fornecedores.jsx` | fornecedores |
| `/sellers` | `Sellers.jsx` | vendedores |
| `/crm` | `CRM.jsx` | funil |
| `/calendar` | `Calendar.jsx` | agenda |
| `/service-orders` | `ServiceOrders.jsx` | assistência técnica |
| `/financial` | `Financial.jsx` | financeiro |
| `/financial/fluxo-caixa` | `CashFlowProjection.jsx` | projeção de fluxo |
| `/whatsapp` | `WhatsApp.jsx` | atendimento |
| `/settings` | `Settings.jsx` | usuários, permissões, tema |

### 8.6 Cliente HTTP

[frontend/src/services/api.js](C:/Users/Matheus/Desktop/vortexys/frontend/src/services/api.js):

- usa `withCredentials: true`
- tenta refresh automático em `401`
- evita redirecionamento indevido no portal público da OS

### 8.7 Contexto de autenticação

[frontend/src/contexts/AuthContext.jsx](C:/Users/Matheus/Desktop/vortexys/frontend/src/contexts/AuthContext.jsx):

- mantém `user` em memória
- consulta `/auth/me` no bootstrap
- ignora bootstrap auth nas rotas `/os/...`

### 8.8 Tema

[frontend/src/contexts/ThemeContext.jsx](C:/Users/Matheus/Desktop/vortexys/frontend/src/contexts/ThemeContext.jsx):

- lê defaults do `VITE_*`
- busca `/api/settings/theme`
- aplica CSS variables em runtime

### 8.9 Layout

[frontend/src/components/Layout.jsx](C:/Users/Matheus/Desktop/vortexys/frontend/src/components/Layout.jsx):

- sidebar
- navegação por módulo
- integração com WebSocket
- renderização do `Outlet`

### 8.10 Componentes reutilizáveis

| Arquivo | Papel |
|---------|-------|
| `components/UI.jsx` | biblioteca interna de inputs, modais, cards, tabelas e helpers visuais |
| `components/ErrorBoundary.jsx` | captura de erro de renderização |
| `components/WarehouseManager.jsx` | gerenciamento de depósitos |
| `components/dashboard/*` | building blocks do BI |
| `components/stock/*` | painéis do estoque |

---

## 9. Fluxos de negócio relevantes

### 9.1 Login

1. usuário envia login + senha
2. backend valida credenciais
3. backend grava cookies de sessão
4. frontend recebe `user`
5. app decide rota com base em permissões

### 9.2 Desconto acima do limite

1. operador informa desconto
2. frontend solicita aprovação
3. backend valida outro login/senha em `/auth/discount-approval`
4. checa `can_authorize_discount` e `discount_limit_pct`
5. pedido persiste aprovador, percentual e data

### 9.3 Ordem de serviço

1. criação da OS
2. cadastro do aparelho
3. itens de orçamento
4. checklist
5. mensagens automáticas ou manuais por WhatsApp
6. cliente acompanha por portal público `/os/:token`

### 9.4 WhatsApp

1. Evolution API recebe / envia mensagens
2. backend sincroniza conversa/mensagem
3. WebSocket avisa a UI
4. operador acompanha em tempo real

### 9.5 White-label

1. valor padrão vem do `VITE_*`
2. admin salva tema em `/api/settings/theme`
3. frontend aplica sem rebuild

---

## 10. Arquivos importantes para manutenção

### Quando mexer em autenticação

- [backend/src/routes/auth.js](C:/Users/Matheus/Desktop/vortexys/backend/src/routes/auth.js)
- [backend/src/middleware/auth.js](C:/Users/Matheus/Desktop/vortexys/backend/src/middleware/auth.js)
- [frontend/src/services/api.js](C:/Users/Matheus/Desktop/vortexys/frontend/src/services/api.js)
- [frontend/src/contexts/AuthContext.jsx](C:/Users/Matheus/Desktop/vortexys/frontend/src/contexts/AuthContext.jsx)

### Quando mexer em permissões

- [backend/src/utils/defaultPermissions.js](C:/Users/Matheus/Desktop/vortexys/backend/src/utils/defaultPermissions.js)
- [backend/src/utils/discountPermissions.js](C:/Users/Matheus/Desktop/vortexys/backend/src/utils/discountPermissions.js)
- [backend/src/middleware/rbac.js](C:/Users/Matheus/Desktop/vortexys/backend/src/middleware/rbac.js)
- [frontend/src/pages/Settings.jsx](C:/Users/Matheus/Desktop/vortexys/frontend/src/pages/Settings.jsx)
- [frontend/src/App.jsx](C:/Users/Matheus/Desktop/vortexys/frontend/src/App.jsx)

### Quando mexer em assistência técnica

- [backend/src/routes/serviceOrders.js](C:/Users/Matheus/Desktop/vortexys/backend/src/routes/serviceOrders.js)
- [backend/src/routes/publicOs.js](C:/Users/Matheus/Desktop/vortexys/backend/src/routes/publicOs.js)
- [frontend/src/pages/ServiceOrders.jsx](C:/Users/Matheus/Desktop/vortexys/frontend/src/pages/ServiceOrders.jsx)
- [frontend/src/pages/OsPortal.jsx](C:/Users/Matheus/Desktop/vortexys/frontend/src/pages/OsPortal.jsx)

### Quando mexer em WhatsApp

- [backend/src/routes/whatsapp.js](C:/Users/Matheus/Desktop/vortexys/backend/src/routes/whatsapp.js)
- [backend/src/services/evolutionApi.js](C:/Users/Matheus/Desktop/vortexys/backend/src/services/evolutionApi.js)
- [backend/src/services/botEngine.js](C:/Users/Matheus/Desktop/vortexys/backend/src/services/botEngine.js)
- [backend/src/services/wsServer.js](C:/Users/Matheus/Desktop/vortexys/backend/src/services/wsServer.js)
- [frontend/src/pages/WhatsApp.jsx](C:/Users/Matheus/Desktop/vortexys/frontend/src/pages/WhatsApp.jsx)

### Quando mexer em deploy

- [deploy.sh](C:/Users/Matheus/Desktop/vortexys/deploy.sh)
- [docker-compose.yml](C:/Users/Matheus/Desktop/vortexys/docker-compose.yml)
- [nginx/nginx.conf](C:/Users/Matheus/Desktop/vortexys/nginx/nginx.conf)
- [.env.example](C:/Users/Matheus/Desktop/vortexys/.env.example)

---

## 11. Observações operacionais

- o projeto depende de `schema.sql` consistente, porque o boot executa migrations a partir dele
- o frontend pressupõe cookies de sessão válidos
- o portal público de OS não deve depender de login
- o WebSocket depende de cookie `access_token` ou fallback bearer
- parte das rotas já usa validação com Zod, mas ainda há endpoints com validação manual
- em produção, sempre revisar `ALLOWED_ORIGIN`, `APP_URL`, `JWT_SECRET` e `DATA_ENCRYPTION_KEY`

---

## 12. Resumo rápido

Se você precisar entender o sistema rapidamente, comece por esta ordem:

1. [docker-compose.yml](C:/Users/Matheus/Desktop/vortexys/docker-compose.yml)
2. [backend/src/server.js](C:/Users/Matheus/Desktop/vortexys/backend/src/server.js)
3. [backend/src/routes/auth.js](C:/Users/Matheus/Desktop/vortexys/backend/src/routes/auth.js)
4. [frontend/src/App.jsx](C:/Users/Matheus/Desktop/vortexys/frontend/src/App.jsx)
5. [frontend/src/services/api.js](C:/Users/Matheus/Desktop/vortexys/frontend/src/services/api.js)
6. módulo específico que você pretende alterar