# Multi-stage: build the static SPA, then serve it from nginx.
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS runtime
# SPA + security headers config, and an entrypoint that renders runtime config
# (apiBase / OIDC settings) from environment variables before nginx starts.
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker-entrypoint.sh /docker-entrypoint.d/40-openbao-gui-config.sh
COPY --from=build /app/dist /usr/share/nginx/html
RUN chmod +x /docker-entrypoint.d/40-openbao-gui-config.sh
EXPOSE 80
# nginx:alpine's stock entrypoint runs everything in /docker-entrypoint.d then execs nginx.
