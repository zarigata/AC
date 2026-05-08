FROM node:22-slim

RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install ws 2>/dev/null || true

COPY . .

RUN mkdir -p /app/data

EXPOSE 4000

CMD ["node", "--experimental-sqlite", "apps/api/src/server.js"]
