# Multi-stage Dockerfile: frontend SELALU dibangun dari source commit ini.
#
# Kenapa guard "pakai build/ bila ada" dihapus:
#   folder build/ TIDAK di-track di repo ini, jadi image bisa tanpa sengaja
#   membungkus bundle lokal dari commit yang berbeda — akibatnya :80 menyajikan
#   bundle yang BUKAN commit yang di-deploy (pernah terjadi: bundle `main`
#   disajikan padahal yang dimaksud PR offline-sync).
#   build/ kini juga masuk .dockerignore, sehingga image selalu = hasil
#   `npm run build` dari source commit ini. Deterministik, tanpa bergantung
#   pada apa yang kebetulan ada di working tree.
#
# Catatan memori: `npm run build` (craco) butuh heap > default pada board
# ber-RAM kecil (mis. Raspberry Pi 906 MB). Naikkan heap di sini dan
# sediakan swap di host bila perlu; lihat docs/PANDUAN-BUILD-PI.md.
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY . .
ARG REACT_APP_BACKEND_URL=""
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL
ARG NODE_HEAP_MB=1024
ENV NODE_OPTIONS="--max-old-space-size=${NODE_HEAP_MB}"
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/build /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
