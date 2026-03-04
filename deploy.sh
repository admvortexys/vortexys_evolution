#!/bin/bash
# =============================================
# VORTEXYS — Deploy script
# Uso: ./deploy.sh [nome-cliente]
# =============================================

set -e

CLIENTE=${1:-"cliente"}
echo "🚀 Deployando instância: $CLIENTE"

# Verifica .env
if [ ! -f ".env" ]; then
  echo "❌ Arquivo .env não encontrado!"
  echo "   Copie .env.example para .env e configure antes de rodar."
  echo "   cp .env.example .env && nano .env"
  exit 1
fi

# Build e sobe containers
echo "🐳 Buildando e subindo containers..."
docker compose down --remove-orphans
docker compose build --no-cache
docker compose up -d

# Aguarda healthcheck
echo "⏳ Aguardando banco de dados..."
sleep 8

echo ""
echo "✅ Vortexys no ar!"
echo "   Acesse: http://$(hostname -I | awk '{print $1}')"
echo "   Ou:     http://localhost"
echo ""
echo "   Login padrão:"
grep ADMIN_EMAIL .env | head -1
grep ADMIN_PASSWORD .env | head -1
echo ""
echo "   Para ver logs: docker compose logs -f"
echo "   Para parar:    docker compose down"
