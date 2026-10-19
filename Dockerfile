FROM node:20.11.0-bookworm

ENV npm_config_cache=/app/.npm-cache \
    npm_config_update_notifier=false

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       libasound2 \
       libatk-bridge2.0-0 \
       libatk1.0-0 \
       libcups2 \
       libdrm2 \
       libgbm1 \
       libgtk-3-0 \
       libnss3 \
       libx11-xcb1 \
       libxcomposite1 \
       libxdamage1 \
       libxfixes3 \
       libxrandr2 \
       xvfb \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --cache .npm-cache

COPY . .

CMD ["xvfb-run", "-a", "npm", "start"]
