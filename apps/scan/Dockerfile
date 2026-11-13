# Try-On 扫码页 — 静态页面，nginx 反代 /api。Cloud Run 自带 HTTPS，手机摄像头可用。
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/scan/package.json apps/scan/
RUN npm install --workspace=@tryon/shared --workspace=@tryon/scan
COPY packages/shared packages/shared
COPY apps/scan apps/scan
RUN npm run build -w @tryon/scan

FROM nginx:1.27-alpine
RUN apk add --no-cache gettext
COPY apps/scan/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY apps/scan/docker-entrypoint.sh /docker-entrypoint-tryon.sh
RUN chmod +x /docker-entrypoint-tryon.sh
COPY --from=build /app/apps/scan/dist /usr/share/nginx/html
EXPOSE 8080
ENTRYPOINT ["/docker-entrypoint-tryon.sh"]
