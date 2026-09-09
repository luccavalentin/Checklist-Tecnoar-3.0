# Infraestrutura — VPS srv1950838

Cada sistema roda em seu próprio container. Um Traefik na borda recebe
todo o tráfego das portas 80/443, termina o TLS e encaminha para o
container certo com base no domínio da requisição.

```
Internet ──► :443 Traefik ──► borda ──┬─► checklist-tecnoar  (:8080)
                (TLS)                 └─► <segundo sistema>  (:xxxx)
```

`borda` é uma rede Docker compartilhada. Ela é a única coisa que os
sistemas têm em comum: nenhum enxerga o volume, o processo ou o
banco do outro.

## Arquivos

| Arquivo | Papel |
|---|---|
| `borda/docker-compose.yml` | Traefik. Sobe uma vez, vive em `/opt/borda` na VPS. |
| `../Dockerfile` | Build do Checklist: node compila, nginx serve. |
| `../docker-compose.yml` | Container do Checklist e suas labels de roteamento. |
| `nginx-app.conf` | nginx interno do container (HTTP puro, porta 8080). |
| `provisionar-vps.sh` | Instala Docker, cria a rede e o firewall. Uma vez. |
| `publicar.sh` | Deploy. É o comando do dia a dia. |

## Publicar uma atualização

```bash
deploy/publicar.sh
```

O build acontece na VPS, dentro do Dockerfile. Se ele falhar, o container
antigo continua no ar — nada é trocado antes da imagem nova existir.

## Adicionar o segundo sistema

Não é preciso tocar no Traefik. No projeto do outro sistema, crie um
`docker-compose.yml` com as mesmas quatro labels, trocando o nome do
router, o domínio e a porta interna:

```yaml
services:
  outro:
    build: .
    container_name: outro-sistema
    restart: unless-stopped
    networks: [borda]
    labels:
      - "traefik.enable=true"
      - "traefik.docker.network=borda"
      - "traefik.http.routers.outro.rule=Host(`outro.tecnoarsistemas.com.br`)"
      - "traefik.http.routers.outro.entrypoints=websecure"
      - "traefik.http.routers.outro.tls.certresolver=letsencrypt"
      - "traefik.http.services.outro.loadbalancer.server.port=3000"

networks:
  borda:
    external: true
```

Aponte o DNS do subdomínio para `179.199.140.86`, rode `docker compose up -d`
e o Traefik emite o certificado sozinho.

## Diagnóstico

```bash
docker ps                              # o que está no ar
docker logs -f checklist-tecnoar       # log do app
docker logs -f traefik                 # roteamento e emissão de certificado
docker compose -f /opt/checklist-tecnoar/docker-compose.yml restart
```
