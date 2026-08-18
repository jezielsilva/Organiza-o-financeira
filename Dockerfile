# ==========================================
# STAGE 1: Build da Aplicação Node/Vite
# ==========================================
FROM node:20-slim AS builder

WORKDIR /app

# Instala dependências do pacote Node
COPY package*.json ./
RUN npm ci

# Copia todo o código fonte e gera o build de produção
COPY . .
RUN npm run build

# ==========================================
# STAGE 2: Imagem Final de Produção (Node.js + Python 3)
# ==========================================
FROM node:20-slim AS runner

# Instala Python 3, pip e bibliotecas do sistema exigidas pelo OpenCV/Pillow
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt-get/lists/*

WORKDIR /app

# Configura ambiente virtual Python para isolamento seguro
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copia e instala dependências Python do microserviço invoice_parser
COPY microservices/invoice_parser/requirements.txt ./microservices/invoice_parser/
RUN pip install --no-cache-dir -r microservices/invoice_parser/requirements.txt

# Copia dependências de produção do Node
COPY package*.json ./
RUN npm ci --only=production

# Copia os artefatos compilados do Stage 1 e arquivos de runtime
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/microservices ./microservices
COPY --from=builder /app/server.ts ./server.ts

# Garante a existência dos diretórios de armazenamento e temporários
RUN mkdir -p /app/sync_data /app/temp_uploads && chown -R node:node /app

# Executa o container com usuário não-root por segurança
USER node

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Healthcheck para verificar se o servidor HTTP responde
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => { if (r.statusCode !== 200) process.exit(1); })"

CMD ["node", "dist/server.cjs"]
