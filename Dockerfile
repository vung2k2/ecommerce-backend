# ==========================================
# STAGE 1: Cài đặt dependencies & generate Prisma Client để build
# ==========================================
FROM node:22-bookworm-slim AS build-deps

WORKDIR /app

# Cài đặt OpenSSL (Prisma yêu cầu trên Linux)
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json tsconfig.json ./
COPY prisma ./prisma/

# Cài đặt toàn bộ dependencies (bao gồm cả devDependencies để biên dịch TypeScript)
RUN npm ci

# Generate Prisma Client vào src/generated/prisma
RUN npx prisma generate

# ==========================================
# STAGE 2: Build TypeScript sang JavaScript
# ==========================================
FROM node:22-bookworm-slim AS builder

WORKDIR /app

COPY --from=build-deps /app/node_modules ./node_modules
COPY tsconfig.json tsconfig.build.json package.json ./
COPY prisma ./prisma/
COPY src ./src/

# Prisma Client duoc generate trong build-deps, khong phu thuoc vao file ignored tren host.
COPY --from=build-deps /app/src/generated/prisma ./src/generated/prisma

# Biên dịch TS -> JS vào thư mục dist/
RUN npm run build

# ==========================================
# STAGE 3: Cài đặt CHỈ Production Dependencies (Tối ưu dung lượng)
# ==========================================
FROM node:22-bookworm-slim AS prod-deps

WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma/

# Chỉ cài đặt production dependencies (loại bỏ vitest, eslint, typescript, @types/...)
RUN npm ci --omit=dev

# ==========================================
# STAGE 4: Chay Prisma migration khi deploy
# Build rieng voi: docker build --target migrator ...
# ==========================================
FROM build-deps AS migrator

COPY --chown=node:node prisma.config.ts ./

USER node

ENTRYPOINT ["./node_modules/.bin/prisma"]
CMD ["migrate", "deploy"]

# ==========================================
# STAGE 5: Production Runner (Image cuối cùng)
# ==========================================
FROM node:22-bookworm-slim AS runner

WORKDIR /app

# Cài đặt OpenSSL cho runtime Prisma
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3000

# Chỉ copy production node_modules và file build dist/
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
COPY --chown=node:node prisma ./prisma/

# Chuyển sang user non-root để tăng cường bảo mật
USER node

EXPOSE 3000

# Khởi động ứng dụng
CMD ["node", "dist/server.js"]
