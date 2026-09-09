#!/usr/bin/env bash
# Publica o Checklist Tecnoar na VPS, em container próprio.
# Uso: deploy/publicar.sh [usuario@host]
set -euo pipefail

ALVO="${1:-root@179.199.140.86}"
CHAVE="${CHAVE_SSH:-$HOME/.ssh/tecnoar_vps}"
APP="/opt/checklist-tecnoar"
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SSH=(ssh -i "$CHAVE" -o StrictHostKeyChecking=accept-new "$ALVO")

cd "$RAIZ"
[ -f .env ] || { echo "!! .env não encontrado na raiz do projeto."; exit 1; }

echo "==> Enviando stack de borda"
"${SSH[@]}" "mkdir -p /opt/borda $APP"
scp -i "$CHAVE" -q deploy/borda/docker-compose.yml "$ALVO:/opt/borda/docker-compose.yml"

echo "==> Enviando código-fonte do Checklist"
# Só o necessário para o build da imagem. node_modules e dist ficam de fora:
# quem os produz é o próprio Dockerfile, de forma reproduzível.
tar --exclude=node_modules --exclude=dist --exclude=.git --exclude='*.log' \
    -czf - src public index.html package.json package-lock.json \
           vite.config.ts tsconfig*.json Dockerfile .dockerignore \
           docker-compose.yml deploy/nginx-app.conf \
  | "${SSH[@]}" "tar -xzf - -C $APP"

echo "==> Enviando variáveis de ambiente"
scp -i "$CHAVE" -q .env "$ALVO:$APP/.env"
"${SSH[@]}" "chmod 600 $APP/.env"

echo "==> Build e subida do container"
"${SSH[@]}" "
  set -e
  docker network inspect borda >/dev/null 2>&1 || docker network create borda
  cd /opt/borda && docker compose up -d
  cd $APP && docker compose up -d --build
  docker image prune -f >/dev/null
"

echo "==> Estado"
"${SSH[@]}" "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"
echo
echo "==> Publicado: https://checklist.tecnoarsistemas.com.br"
