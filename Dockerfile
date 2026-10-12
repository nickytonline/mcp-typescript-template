# using slim instead of alpine for better compatibility with optional dependencies
# Node.js 24.0.0+ required (Active LTS)
FROM node:24-slim

RUN apt-get update && apt-get install -y python3 make g++ git && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --prefer-offline

COPY *.ts *.json ./
COPY ./src/ ./src/
COPY ./skills/ ./skills/

# A directory under skills/ opts this image into Agent Skills and must
# contain a non-empty SKILL.md. skills/.gitkeep alone does not.
RUN npm run build && \
    for dir in skills/*/; do \
      if [ -d "$dir" ]; then \
        test -s "${dir}SKILL.md"; \
      fi; \
    done

EXPOSE 3000

CMD ["npm", "run", "start"]