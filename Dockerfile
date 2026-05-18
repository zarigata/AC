FROM node:22-alpine
RUN apk add --no-cache tini
WORKDIR /app
COPY . .
ENV PORT=4000
ENV HOST=0.0.0.0
ENV ZAZI_DB_PATH=/data/zazi.sqlite
RUN mkdir -p /data
EXPOSE 4000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "--experimental-sqlite", "apps/api/src/server.js"]
