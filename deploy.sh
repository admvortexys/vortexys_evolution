#!/usr/bin/env bash
# =============================================================================
#  VORTEXYS — Deploy Script
#  Uso:  ./deploy.sh [--cliente nome]  [--porta 80]  [--no-cache]
#  Ex.:  ./deploy.sh --cliente acme --porta 8080
# =============================================================================

set -euo pipefail

# ── Cores ─────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

ok()   { echo -e "${GREEN}✔${RESET}  $*"; }
info() { echo -e "${CYAN}→${RESET}  $*"; }
warn() { echo -e "${YELLOW}⚠${RESET}  $*"; }
fail() { echo -e "${RED}✘  $*${RESET}"; exit 1; }
line() { echo -e "${CYAN}────────────────────────────────────────────────────${RESET}"; }

# ── Argumentos opcionais ───────────────────────────────────────────────────────
CLIENTE="default"
NO_CACHE=""
PORT=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --cliente) CLIENTE="$2"; shift 2 ;;
    --porta)   PORT="$2";    shift 2 ;;
    --no-cache) NO_CACHE="--no-cache"; shift ;;
    -*)        warn "Argumento desconhecido: $1"; shift ;;
    *)         CLIENTE="$1"; shift ;;          # compatibilidade: ./deploy.sh nome
  esac
done

# ── Banner ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${CYAN}"
echo "  ██╗   ██╗ ██████╗ ██████╗ ████████╗███████╗██╗  ██╗██╗   ██╗███████╗"
echo "  ██║   ██║██╔═══██╗██╔══██╗╚══██╔══╝██╔════╝╚██╗██╔╝╚██╗ ██╔╝██╔════╝"
echo "  ██║   ██║██║   ██║██████╔╝   ██║   █████╗   ╚███╔╝  ╚████╔╝ ███████╗ "
echo "  ╚██╗ ██╔╝██║   ██║██╔══██╗   ██║   ██╔══╝   ██╔██╗   ╚██╔╝  ╚════██║"
echo "   ╚████╔╝ ╚██████╔╝██║  ██║   ██║   ███████╗██╔╝ ██╗   ██║   ███████║"
echo "    ╚═══╝   ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚══════╝╚═╝  ╚═╝   ╚═╝   ╚══════╝"
echo -e "${RESET}"
echo -e "  ${BOLD}Sistema de Gestão Empresarial — Deploy${RESET}   cliente: ${YELLOW}${CLIENTE}${RESET}"
line

# ── 1. Verificar dependências ─────────────────────────────────────────────────
info "Verificando dependências..."

command -v docker >/dev/null 2>&1 || fail "Docker não encontrado. Instale em: https://docs.docker.com/get-docker/"

DOCKER_COMPOSE_CMD=""
if docker compose version >/dev/null 2>&1; then
  DOCKER_COMPOSE_CMD="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DOCKER_COMPOSE_CMD="docker-compose"
else
  fail "Docker Compose não encontrado. Instale o Docker Desktop ou docker-compose."
fi

ok "Docker $(docker --version | grep -oP '\d+\.\d+\.\d+' | head -1) encontrado"
ok "Docker Compose disponível ($DOCKER_COMPOSE_CMD)"

# ── 2. Verificar .env ─────────────────────────────────────────────────────────
info "Verificando arquivo de configuração..."

if [ ! -f ".env" ]; then
  warn ".env não encontrado — criando a partir de .env.example..."
  if [ ! -f ".env.example" ]; then
    fail "Nenhum .env ou .env.example encontrado no diretório atual."
  fi
  cp .env.example .env
  warn "Arquivo .env criado. ${BOLD}Configure as variáveis antes de continuar.${RESET}"
  echo ""
  echo "  Edite o arquivo:  nano .env  (ou  vim .env)"
  echo "  Depois execute:   ./deploy.sh novamente"
  echo ""
  exit 1
fi

ok ".env encontrado"

# Validar variáveis obrigatórias
REQUIRED_VARS=("JWT_SECRET" "DB_PASSWORD" "ADMIN_EMAIL" "ADMIN_PASSWORD")
MISSING=()
for var in "${REQUIRED_VARS[@]}"; do
  val=$(grep -E "^${var}=" .env | cut -d= -f2- | tr -d '"' | xargs 2>/dev/null || true)
  if [ -z "$val" ]; then
    MISSING+=("$var")
  fi
done

if [ ${#MISSING[@]} -gt 0 ]; then
  fail "Variáveis obrigatórias não definidas no .env: ${MISSING[*]}"
fi

# Alertar sobre JWT_SECRET fraco
JWT_VAL=$(grep -E "^JWT_SECRET=" .env | cut -d= -f2- | tr -d '"' | xargs 2>/dev/null || true)
if [[ "$JWT_VAL" == *"TROQUE"* ]] || [[ "$JWT_VAL" == *"troque"* ]] || [ ${#JWT_VAL} -lt 32 ]; then
  warn "JWT_SECRET parece ser o valor padrão ou muito curto (mín. 32 chars)."
  warn "Gere um seguro com: openssl rand -hex 32"
fi

# Alertar sobre senha admin fraca
ADMIN_PASS=$(grep -E "^ADMIN_PASSWORD=" .env | cut -d= -f2- | tr -d '"' | xargs 2>/dev/null || true)
if [ ${#ADMIN_PASS} -lt 8 ]; then
  fail "ADMIN_PASSWORD muito curta (mínimo 8 caracteres)."
fi

ok "Variáveis de configuração validadas"

# ── 3. Sobrescrever porta se passada como argumento ───────────────────────────
if [ -n "$PORT" ]; then
  # Substitui ou adiciona HOST_PORT no .env
  if grep -q "^HOST_PORT=" .env; then
    sed -i "s/^HOST_PORT=.*/HOST_PORT=${PORT}/" .env
  else
    echo "HOST_PORT=${PORT}" >> .env
  fi
  info "Porta configurada: ${PORT}"
fi

# ── 4. Build e deploy ─────────────────────────────────────────────────────────
line
info "Parando containers antigos..."
$DOCKER_COMPOSE_CMD down --remove-orphans 2>/dev/null || true

info "Construindo imagens${NO_CACHE:+ (sem cache)}..."
$DOCKER_COMPOSE_CMD build ${NO_CACHE}

info "Subindo containers..."
$DOCKER_COMPOSE_CMD up -d

# ── 5. Health check ────────────────────────────────────────────────────────────
info "Aguardando serviços ficarem prontos..."

MAX_TRIES=30
TRIES=0
printf "  "
while [ $TRIES -lt $MAX_TRIES ]; do
  # Tenta o health endpoint do backend
  HTTP_CODE=$(docker exec vrx-api wget -qO- --server-response http://localhost:3001/api/health 2>&1 | grep "HTTP/" | awk '{print $2}' | tail -1 || echo "0")
  if [ "$HTTP_CODE" = "200" ]; then
    echo ""
    ok "Backend online!"
    break
  fi
  printf "."
  sleep 2
  TRIES=$((TRIES + 1))
done

if [ $TRIES -eq $MAX_TRIES ]; then
  echo ""
  warn "Backend demorou a responder — pode ainda estar iniciando. Verifique com: $DOCKER_COMPOSE_CMD logs backend"
fi

# ── 6. Resumo ──────────────────────────────────────────────────────────────────
line
echo ""
echo -e "${GREEN}${BOLD}  ✅  Vortexys está no ar!${RESET}"
echo ""

HOST_PORT=$(grep -E "^HOST_PORT=" .env | cut -d= -f2- | xargs 2>/dev/null || true)
PORTA="${HOST_PORT:-$(grep -E '^\s+- "' docker-compose.yml | grep nginx | grep -oP '\d+(?=:80)' | head -1 || echo 80)}"
IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")

echo -e "  ${BOLD}Acesse:${RESET}"
echo -e "    Local:  ${CYAN}http://localhost:${PORTA}${RESET}"
echo -e "    Rede:   ${CYAN}http://${IP}:${PORTA}${RESET}"
echo ""
echo -e "  ${BOLD}Login inicial:${RESET}"
echo -e "    Email:  ${YELLOW}$(grep -E '^ADMIN_EMAIL=' .env | cut -d= -f2-)${RESET}"
echo -e "    Senha:  ${YELLOW}(definida no .env)${RESET}"
echo ""
echo -e "  ${BOLD}Comandos úteis:${RESET}"
echo -e "    Logs em tempo real:   ${CYAN}$DOCKER_COMPOSE_CMD logs -f${RESET}"
echo -e "    Logs só do backend:   ${CYAN}$DOCKER_COMPOSE_CMD logs -f backend${RESET}"
echo -e "    Parar tudo:           ${CYAN}$DOCKER_COMPOSE_CMD down${RESET}"
echo -e "    Reiniciar backend:    ${CYAN}$DOCKER_COMPOSE_CMD restart backend${RESET}"
echo -e "    Backup do banco:      ${CYAN}docker exec vrx-db pg_dump -U vortexys vortexys > backup_\$(date +%Y%m%d).sql${RESET}"
echo ""
line
