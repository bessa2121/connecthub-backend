# Build estático + nginx. Uso: docker build --build-arg API_URL=https://sua-api.onrender.com -t connecthub-web .
FROM node:22-alpine AS build
WORKDIR /app
ARG API_URL
ENV API_URL=$API_URL
COPY package.json ./
COPY scripts ./scripts
COPY src ./src
RUN node scripts/build.mjs

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
