# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Install libc6-compat for Alpine compatibility
RUN apk add --no-cache libc6-compat

# Enable corepack for pnpm
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate

# Copy monorepo root files
COPY . .

# Install all dependencies for build
RUN pnpm install --frozen-lockfile

RUN pnpm build

# Production stage
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME="0.0.0.0"
ENV PORT=3000

# Create user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nitrojs

# Copy built application
COPY --from=builder --chown=nitrojs:nodejs /app/.output ./
COPY --from=builder --chown=nitrojs:nodejs /app/node_modules ./node_modules
COPY ./drizzle /app/drizzle

USER nitrojs

EXPOSE 3000

CMD ["sh", "-c", "node drizzle/migrate.js && node server/index.mjs"]