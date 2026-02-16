# Multi-stage Dockerfile for Next.js app

# Stage 1: Base
FROM node:22-alpine AS base
RUN corepack enable pnpm
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

# Stage 2: Development
FROM base AS development
ENV NODE_ENV=development
COPY . .
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

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

# Copy built application
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./

# Expose port
EXPOSE 3010
ENV PORT=3010

# Start app
CMD ["pnpm", "start"]
