# physical-image-eval backend (Node 22). Self-contained build from the backend/ context.
# Runtime uses tsx (no separate JS build step); Prisma client generated at build time.
FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NODE_ENV=production

# Install dependencies (incl. tsx + prisma CLI used at runtime/deploy).
COPY package.json ./
RUN npm install --no-audit --no-fund

# Prisma schema + generate client.
COPY prisma ./prisma
RUN npx prisma generate

# Application source.
COPY tsconfig.json ./
COPY src ./src

EXPOSE 3100

# Apply migrations, (idempotent) bootstrap first admin, then serve.
CMD ["sh", "-c", "npx prisma migrate deploy && npm run seed:bootstrap-admin && npm run start"]
