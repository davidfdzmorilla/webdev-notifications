# Multi-stage Dockerfile for Next.js app

# Stage 1: Base with dependencies
FROM node:22-alpine AS base
RUN corepack enable pnpm
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

# Stage 2: Development
FROM base AS development
ENV NODE_ENV=development
COPY . .
EXPOSE 3010
ENV PORT=3010
CMD ["pnpm", "dev"]

# Stage 3: Builder
FROM base AS builder
COPY . .
RUN pnpm build

# Stage 4: Production
FROM node:22-alpine AS production
RUN corepack enable pnpm
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3010

# Copy all files and dependencies (needed for Next.js runtime)
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

# Copy built application from builder
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/next.config.ts ./

# Copy public dir if it exists
COPY --from=builder /app/public ./public

# Expose port
EXPOSE 3010

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3010/api/health || exit 1

# Start app
CMD ["pnpm", "start"]
