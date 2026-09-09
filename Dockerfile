# ---- Estágio 1: build ----
FROM node:22-alpine AS build
WORKDIR /app

# As variáveis VITE_* são embutidas no bundle em tempo de build,
# não lidas em runtime. Por isso entram como build args.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY

COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Estágio 2: runtime ----
FROM nginx:1.27-alpine AS runtime
COPY deploy/nginx-app.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

# Sobe como usuário sem privilégio: o container não precisa de root
# para servir arquivos estáticos.
RUN touch /var/run/nginx.pid \
 && chown -R nginx:nginx /var/run/nginx.pid /var/cache/nginx /usr/share/nginx/html
USER nginx

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
