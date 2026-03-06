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

| Módulo | Descrição |
|--------|-----------|
| **Dashboard** | KPIs em tempo real, BI por aba (Geral, Financeiro, Vendedores, Produtos, Clientes, CRM). Filtros por mês, data ou período. Exportação XLSX. |
| **Produtos** | Catálogo com imagens, SKU, código de barras, margem de lucro, categorias |
| **Estoque** | Movimentações (entrada/saída/ajuste), histórico por produto |
| **Pedidos** | Fluxo completo com status customizáveis, baixa automática de estoque |
| **Devoluções** | Gestão de devoluções vinculadas a pedidos |
| **Clientes** | Cadastro de clientes e fornecedores (CPF/CNPJ) |
| **Vendedores** | Equipe de vendas com metas e comissões |
| **CRM** | Funil Kanban de leads, pipelines customizáveis, atividades |
| **Propostas** | Orçamentos e propostas comerciais |
| **Agenda** | Calendário de compromissos |
| **Assistência** | Ordens de serviço (reparos, orçamentos, entregas) |
| **WhatsApp** | Integração Evolution API (mensagens, bot, chat interno) |
| **Financeiro** | Contas a pagar/receber, categorias, recorrências, fontes de receita |
| **Configurações** | Usuários, permissões por módulo, identidade visual |

---

## Deploy rápido

### Pré-requisitos

- Docker e Docker Compose instalados
- Porta 80 (ou outra) disponível

### 1. Clone e configure

```bash
git clone <repo-url> /opt/vortexys
cd /opt/vortexys
cp .env.example .env
nano .env
```

### 2. Variáveis obrigatórias

```env
DB_PASSWORD=senha_segura_aqui
JWT_SECRET=string_aleatoria_longua_32_chars   # openssl rand -hex 32
ADMIN_EMAIL=admin@cliente.com
ADMIN_PASSWORD=SenhaForte2026!
ADMIN_NAME=Administrador
```

### 3. Suba os containers

```bash
./deploy.sh
```

### Opções do deploy

```bash
./deploy.sh --cliente acme      # identifica nos logs
./deploy.sh --porta 8080        # porta customizada
./deploy.sh --no-cache          # rebuild completo
```

---

## White-label (Identidade visual)

A identidade visual pode ser configurada de duas formas:

### 1. Via tela (recomendado)

**Configurações → Identidade visual** — altere nome, cores e logo diretamente. As mudanças são aplicadas em tempo real, sem rebuild.

### 2. Via .env (build-time)

Para definir o padrão inicial ou em novos deploys:

| Variável | Descrição | Padrão |
|----------|-----------|--------|
| `VITE_COMPANY_NAME` | Nome na sidebar e login | `Vortexys` |
| `VITE_PRIMARY_COLOR` | Cor principal | `#a855f7` |
| `VITE_SECONDARY_COLOR` | Cor secundária | `#f97316` |
| `VITE_LOGO_URL` | URL do logo (PNG/SVG). Vazio = ícone padrão | — |

---

## Documentação detalhada

Para documentação completa do sistema, incluindo descrição de cada arquivo e fluxos, veja **[DOCS.md](./DOCS.md)**.

---

## Comandos úteis

```bash
# Logs em tempo real
docker compose logs -f

# Reiniciar serviço
docker compose restart backend

# Acessar banco
docker exec -it vrx-db psql -U vortexys vortexys

# Backup
docker exec vrx-db pg_dump -U vortexys vortexys > backup_$(date +%Y%m%d).sql
```

---

## Estrutura do projeto

```
vortexys/
├── README.md, DOCS.md
├── deploy.sh
├── docker-compose.yml
├── .env.example
├── nginx/nginx.conf
├── backend/src/
│   ├── server.js
│   ├── config/env.js
│   ├── database/db.js, schema.sql
│   ├── middleware/auth.js, rbac.js, errorHandler.js, validate.js
│   ├── routes/           # auth, users, products, orders, leads...
│   └── services/         # evolutionApi.js, botEngine.js, wsServer.js
└── frontend/src/
    ├── App.jsx, main.jsx
    ├── contexts/         # AuthContext, ThemeContext, ToastContext
    ├── services/api.js
    ├── components/       # Layout, UI, ErrorBoundary
    └── pages/            # Login, Dashboard, Products, Orders...
```
