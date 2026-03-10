# Vortexys

Sistema de gestão empresarial com ERP, CRM, financeiro, assistência técnica e WhatsApp em uma stack Dockerizada e white-label.

O projeto foi organizado para subir uma instância completa por cliente, com backend Node.js + Express, frontend React + Vite, PostgreSQL, Redis, Evolution API e Nginx.

## Destaques

- ERP com produtos, estoque, pedidos, devoluções e créditos
- CRM com pipelines, leads, atividades, propostas e agenda
- Financeiro com contas, categorias, recorrências e projeção de fluxo de caixa
- Assistência técnica com ordens de serviço, checklist, peças e portal público
- Integração com WhatsApp via Evolution API
- Controle de acesso por permissões e identidade visual white-label

## Stack

| Camada | Tecnologia |
|--------|------------|
| Frontend | React 18 + Vite + Axios + Recharts |
| Backend | Node.js + Express + WebSocket |
| Banco | PostgreSQL 16 |
| Cache / suporte WhatsApp | Redis 7 |
| WhatsApp | Evolution API |
| Proxy | Nginx |

## Arquitetura

```text
Navegador
  -> Nginx
     -> /api   -> Backend Express
     -> /ws    -> WebSocket
     -> /      -> Frontend React

Backend
  -> PostgreSQL
  -> Redis
  -> Evolution API
```

## Autenticação atual

O fluxo web atual usa sessão por cookie, não token salvo em `localStorage`.

- login em `POST /api/auth/login`
- `access_token` e `vrx_refresh` em cookies `HttpOnly`
- refresh automático em `401` via `POST /api/auth/refresh`
- redirecionamento para troca de senha quando `force_password_change = true`

### Política de senha

A senha precisa ter:

- no mínimo 8 caracteres
- pelo menos 1 letra minúscula
- pelo menos 1 letra maiúscula
- pelo menos 1 número

## Estrutura do projeto

```text
vortexys/
├── README.md
├── DOCS.md
├── deploy.sh
├── docker-compose.yml
├── .env.example
├── nginx/
├── backend/
└── frontend/
```

## Pré-requisitos

- Docker
- Docker Compose (`docker compose` ou `docker-compose`)
- Porta HTTP livre no host, por padrão `80`

## Deploy rápido

### 1. Configure o ambiente

```bash
cp .env.example .env
nano .env
```

### 2. Revise pelo menos estas variáveis

```env
DB_PASSWORD=troque_esta_senha
JWT_SECRET=gere_um_segredo_forte_com_32_bytes_ou_mais
DATA_ENCRYPTION_KEY=gere_outro_segredo_forte_com_32_bytes_ou_mais
ADMIN_NAME=Administrador
ADMIN_USERNAME=administrador
ADMIN_EMAIL=admin@seudominio.com
ADMIN_PASSWORD=SenhaForte2026!
EVOLUTION_API_KEY=troque_esta_chave
WA_WEBHOOK_SECRET=gere_um_hex_aleatorio
ALLOWED_ORIGIN=http://localhost
APP_URL=http://SEU_DOMINIO_OU_IP
```

### 3. Suba a stack

```bash
./deploy.sh
```

### Opções úteis do deploy

```bash
./deploy.sh --cliente acme
./deploy.sh --porta 8080
./deploy.sh --no-cache
```

## Containers da stack

O `docker-compose.yml` sobe estes serviços:

- `postgres` (`vrx-db`)
- `redis` (`vrx-redis`)
- `evolution-api` (`vrx-evolution`)
- `backend` (`vrx-api`)
- `frontend` (`vrx-app`)
- `nginx` (`vrx-nginx`)

## Primeiro login

O backend tenta criar o administrador inicial no boot usando `ADMIN_NAME`, `ADMIN_USERNAME`, `ADMIN_EMAIL` e `ADMIN_PASSWORD`.

Regras importantes:

- o admin só é criado se ainda não existir usuário com o mesmo email ou username
- a senha precisa atender a política atual
- no primeiro login, o usuário pode ser forçado a trocar a senha

## White-label

Você pode customizar a identidade visual de duas formas.

### Via interface

Use `Configurações -> Identidade visual` para alterar nome, cores e logo sem rebuild.

### Via `.env`

Valores iniciais do frontend buildado:

- `VITE_COMPANY_NAME`
- `VITE_PRIMARY_COLOR`
- `VITE_SECONDARY_COLOR`
- `VITE_LOGO_URL`
- `VITE_API_URL`

## Operação no dia a dia

### Logs

```bash
docker compose logs -f
docker compose logs -f backend
docker compose logs -f nginx
```

### Rebuild / restart

```bash
docker compose up -d --build
docker compose restart backend
docker compose restart nginx
```

### Banco de dados

```bash
docker exec -it vrx-db psql -U vortexys vortexys
docker exec vrx-db pg_dump -U vortexys vortexys > backup_$(date +%Y%m%d).sql
```

### Healthcheck

```bash
curl http://localhost/api/health
```

## Desenvolvimento local

Se você quiser trabalhar fora do Docker:

### Backend

```bash
cd backend
npm install
npm start
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Observações:

- o frontend usa Vite
- o backend expõe a API e o WebSocket na mesma aplicação Express
- em produção, o caminho recomendado continua sendo Docker + Nginx

## Onde olhar primeiro

- [DOCS.md](./DOCS.md) para a documentação técnica completa
- [docker-compose.yml](./docker-compose.yml) para a topologia da stack
- [deploy.sh](./deploy.sh) para o fluxo de deploy
- [backend/src/server.js](./backend/src/server.js) para o boot da API
- [frontend/src/App.jsx](./frontend/src/App.jsx) para o mapa de rotas da SPA

## Módulos principais

- Dashboard e BI
- Produtos e estoque
- Pedidos, devoluções e créditos
- Clientes e vendedores
- CRM, agenda e propostas
- Financeiro e projeções
- Assistência técnica e portal público de OS
- WhatsApp e automações de atendimento
- Configurações, usuários e permissões

## Observações importantes

- o portal público de OS usa token dedicado e rate limit próprio
- dados sensíveis da assistência técnica usam proteção adicional no backend
- o WebSocket depende da sessão autenticada
- em produção, revise sempre `ALLOWED_ORIGIN`, `APP_URL`, `JWT_SECRET`, `DATA_ENCRYPTION_KEY` e as credenciais do admin

## Licença / uso

Repositório interno do projeto Vortexys. Se este ambiente for distribuído por cliente, mantenha as credenciais, branding e segredos separados por instância.