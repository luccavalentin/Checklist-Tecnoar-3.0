#!/usr/bin/env bash
# Prepara a VPS para hospedar vários sistemas em containers.
# Rodar UMA vez, como root, na própria VPS.
set -euo pipefail

echo "==> Docker"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

echo "==> Rede compartilhada 'borda'"
docker network inspect borda >/dev/null 2>&1 || docker network create borda

echo "==> Firewall"
if command -v ufw >/dev/null 2>&1; then
  ufw allow OpenSSH >/dev/null
  ufw allow 80/tcp   >/dev/null
  ufw allow 443/tcp  >/dev/null
  ufw --force enable >/dev/null
fi

echo "==> Traefik (proxy de borda)"
mkdir -p /opt/borda
# O compose do Traefik é enviado para /opt/borda pelo publicar.sh.
cd /opt/borda
docker compose up -d

echo "==> Pronto."
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
