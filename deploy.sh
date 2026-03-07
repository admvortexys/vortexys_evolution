#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

ok() { echo -e "${GREEN}OK${RESET}  $*"; }
info() { echo -e "${CYAN}=>${RESET}  $*"; }
warn() { echo -e "${YELLOW}!!${RESET}  $*"; }
fail() { echo -e "${RED}ERRO${RESET}  $*"; exit 1; }
line() { echo -e "${CYAN}------------------------------------------------------------${RESET}"; }

PROJECT_NAME="${COMPOSE_PROJECT_NAME:-$(basename "$PWD" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-')}"
DB_VOLUME_NAME="${PROJECT_NAME}_pgdata"

read_env_var() {
  local key="$1"
  grep -E "^${key}=" .env | head -1 | cut -d= -f2- | tr -d '"' | xargs 2>/dev/null || true
}

is_invalid_env_value() {
  local value="$1"
  if [ -z "$value" ]; then
    return 0
  fi
  case "$value" in
    *TROQUE*|*troque*|admin@seudominio.com|changeme|CHANGEME)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

set_env_var() {
  local key="$1"
  local value="$2"
  local escaped
  escaped=$(printf '%s' "$value" | sed -e 's/[\/&]/\\&/g')
  if grep -q "^${key}=" .env; then
    sed -i "s/^${key}=.*/${key}=${escaped}/" .env
  else
    echo "${key}=${value}" >> .env
  fi
}

generate_secret() {
  local size="${1:-32}"
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$size"
  else
    head -c "$size" /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}

prompt_hidden_value() {
  local key="$1"
  local min_len="$2"
  local label="$3"
  local input=""
  while true; do
    read -rsp "${label}: " input
    echo ""
    if [ ${#input} -lt "$min_len" ]; then
      warn "${key} precisa ter no minimo ${min_len} caracteres."
      continue
    fi
    set_env_var "$key" "$input"
    break
  done
}

db_volume_exists() {
  docker volume inspect "$DB_VOLUME_NAME" >/dev/null 2>&1
}

derive_admin_username() {
  local current
  local fallback
  current=$(read_env_var "ADMIN_USERNAME")
  if [ -n "$current" ]; then
    echo "$current"
    return
  fi
  fallback=$(read_env_var "ADMIN_NAME")
  fallback=$(printf '%s' "${fallback:-admin}" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/ /g' | xargs | tr -d ' ')
  echo "${fallback:-admin}"
}

CLIENTE="default"
NO_CACHE=""
PORT=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --cliente) CLIENTE="$2"; shift 2 ;;
    --porta) PORT="$2"; shift 2 ;;
    --no-cache) NO_CACHE="--no-cache"; shift ;;
    -*) warn "Argumento desconhecido: $1"; shift ;;
    *) CLIENTE="$1"; shift ;;
  esac
done

echo ""
echo -e "${BOLD}${CYAN}VORTEXYS deploy${RESET}  cliente: ${YELLOW}${CLIENTE}${RESET}"
line

info "Verificando dependencias..."
command -v docker >/dev/null 2>&1 || fail "Docker nao encontrado"

DOCKER_COMPOSE_CMD=""
if docker compose version >/dev/null 2>&1; then
  DOCKER_COMPOSE_CMD="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DOCKER_COMPOSE_CMD="docker-compose"
else
  fail "Docker Compose nao encontrado"
fi
ok "Docker e Compose encontrados"

info "Verificando .env..."
if [ ! -f ".env" ]; then
  if [ ! -f ".env.example" ]; then
    fail "Nenhum .env ou .env.example encontrado"
  fi
  cp .env.example .env
  warn ".env criado a partir do exemplo"
fi
ok ".env pronto"

JWT_VAL=$(read_env_var "JWT_SECRET")
if is_invalid_env_value "$JWT_VAL" || [ ${#JWT_VAL} -lt 32 ]; then
  info "JWT_SECRET ausente/padrao. Gerando automaticamente..."
  JWT_VAL=$(generate_secret 32)
  set_env_var "JWT_SECRET" "$JWT_VAL"
  ok "JWT_SECRET atualizado"
fi

DB_PASS=$(read_env_var "DB_PASSWORD")
if is_invalid_env_value "$DB_PASS"; then
  if db_volume_exists; then
    fail "DB_PASSWORD no .env esta vazio/padrao, mas o volume ${DB_VOLUME_NAME} ja existe. Defina a senha atual do banco no .env ou remova o volume para recriar o Postgres."
  fi
  info "DB_PASSWORD ausente/padrao. Gerando automaticamente..."
  DB_PASS=$(generate_secret 18)
  set_env_var "DB_PASSWORD" "$DB_PASS"
  ok "DB_PASSWORD atualizado"
fi

ADMIN_EMAIL_VAL=$(read_env_var "ADMIN_EMAIL")
if is_invalid_env_value "$ADMIN_EMAIL_VAL"; then
  if [ -t 0 ]; then
    read -rp "ADMIN_EMAIL: " ADMIN_EMAIL_VAL
    [ -n "$ADMIN_EMAIL_VAL" ] || fail "ADMIN_EMAIL e obrigatorio"
    set_env_var "ADMIN_EMAIL" "$ADMIN_EMAIL_VAL"
    ok "ADMIN_EMAIL atualizado"
  else
    fail "ADMIN_EMAIL invalido no .env"
  fi
fi

ADMIN_USERNAME_VAL=$(derive_admin_username)
if [ -z "$ADMIN_USERNAME_VAL" ]; then
  ADMIN_USERNAME_VAL="admin"
fi
set_env_var "ADMIN_USERNAME" "$ADMIN_USERNAME_VAL"
ok "ADMIN_USERNAME definido como ${ADMIN_USERNAME_VAL}"

GENERATED_ADMIN_PASSWORD=""
ADMIN_PASS=$(read_env_var "ADMIN_PASSWORD")
if is_invalid_env_value "$ADMIN_PASS" || [ ${#ADMIN_PASS} -lt 8 ]; then
  if [ -t 0 ]; then
    info "Defina a senha do administrador inicial"
    prompt_hidden_value "ADMIN_PASSWORD" 8 "ADMIN_PASSWORD"
    ok "ADMIN_PASSWORD atualizado"
  else
    ADMIN_PASS=$(generate_secret 10)
    set_env_var "ADMIN_PASSWORD" "$ADMIN_PASS"
    GENERATED_ADMIN_PASSWORD="$ADMIN_PASS"
    warn "ADMIN_PASSWORD nao definido. Senha temporaria gerada automaticamente"
  fi
fi

if [ -n "$PORT" ]; then
  if grep -q "^HOST_PORT=" .env; then
    sed -i "s/^HOST_PORT=.*/HOST_PORT=${PORT}/" .env
  else
    echo "HOST_PORT=${PORT}" >> .env
  fi
  ok "HOST_PORT=${PORT}"
fi

line
info "Parando containers antigos..."
$DOCKER_COMPOSE_CMD down --remove-orphans 2>/dev/null || true

info "Construindo imagens ${NO_CACHE}..."
$DOCKER_COMPOSE_CMD build ${NO_CACHE}

info "Subindo containers..."
$DOCKER_COMPOSE_CMD up -d

info "Aguardando healthcheck..."
MAX_TRIES=30
TRIES=0
printf "  "
while [ $TRIES -lt $MAX_TRIES ]; do
  HTTP_CODE=$(docker exec vrx-api wget -qO- --server-response http://localhost:3001/api/health 2>&1 | grep "HTTP/" | awk '{print $2}' | tail -1 || echo "0")
  if [ "$HTTP_CODE" = "200" ]; then
    echo ""
    ok "Backend online"
    break
  fi
  printf "."
  sleep 2
  TRIES=$((TRIES + 1))
done

if [ $TRIES -eq $MAX_TRIES ]; then
  echo ""
  warn "Backend demorou para responder. Confira: $DOCKER_COMPOSE_CMD logs backend"
fi

line
HOST_PORT=$(read_env_var "HOST_PORT")
PORTA="${HOST_PORT:-80}"
IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")

echo ""
echo -e "${GREEN}${BOLD}Vortexys no ar${RESET}"
echo -e "  Local:  ${CYAN}http://localhost:${PORTA}${RESET}"
echo -e "  Rede:   ${CYAN}http://${IP}:${PORTA}${RESET}"
echo ""
echo -e "${BOLD}Login inicial${RESET}"
ADMIN_USERNAME_VAL=$(derive_admin_username)
echo -e "  Usuario: ${YELLOW}${ADMIN_USERNAME_VAL:-admin}${RESET}"
if [ -n "${GENERATED_ADMIN_PASSWORD}" ]; then
  echo -e "  Senha:   ${YELLOW}${GENERATED_ADMIN_PASSWORD}${RESET} ${BOLD}(gerada neste deploy)${RESET}"
else
  echo -e "  Senha:   ${YELLOW}(definida no .env)${RESET}"
fi

echo ""
echo -e "${BOLD}Comandos uteis${RESET}"
echo -e "  Logs:          ${CYAN}$DOCKER_COMPOSE_CMD logs -f${RESET}"
echo -e "  Logs backend:  ${CYAN}$DOCKER_COMPOSE_CMD logs -f backend${RESET}"
echo -e "  Parar:         ${CYAN}$DOCKER_COMPOSE_CMD down${RESET}"
line