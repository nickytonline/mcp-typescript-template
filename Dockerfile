# using slim instead of alpine for better compatibility with optional dependencies
# Node.js 24.0.0+ required (Active LTS)
FROM node:24-slim

RUN apt-get update && apt-get install -y python3 make g++ git && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --prefer-offline

COPY *.ts *.json ./
COPY ./src/ ./src/

RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]