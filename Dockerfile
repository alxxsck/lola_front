# Lola CMS (Vue 3 + Vite) — static SPA served by nginx.
# Build-time VITE_API_BASE_URL is RELATIVE (/api/v1): the CMS is served same-origin
# with the backend (nginx proxies /api and /socket.io), so no CORS and no absolute
# backend URL is baked in. The runtime nginx config is supplied by a k8s ConfigMap
# mounted at /etc/nginx/conf.d/default.conf (this image ships a plain SPA fallback
# on :8080 so it also works standalone).
ARG NODE_IMAGE=node:22-alpine

FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --prefer-offline --no-audit
COPY . .
ARG VITE_API_BASE_URL=/api/v1
ARG VITE_DATA_MODE=api
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL} \
    VITE_DATA_MODE=${VITE_DATA_MODE}
RUN npm run build

FROM nginx:1.27-alpine AS production
COPY --from=build /app/dist /usr/share/nginx/html
# Fallback config (overridden in k8s by the lola-cms-nginx-conf ConfigMap).
RUN printf 'server {\n  listen 8080;\n  server_name _;\n  root /usr/share/nginx/html;\n  index index.html;\n  location / { try_files $uri /index.html; }\n}\n' \
    > /etc/nginx/conf.d/default.conf
EXPOSE 8080
