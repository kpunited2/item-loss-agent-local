# syntax=docker/dockerfile:1.6

# ---- Stage 1: Build ----
FROM --platform=$BUILDPLATFORM node:20-slim AS builder

WORKDIR /app

# Install ALL deps (including devDependencies like vite)
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci || (rm -rf node_modules package-lock.json && npm install)

# Copy source and build
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
COPY . .

# Set NODE_ENV=production only for the build step so Vite optimizes correctly
RUN NODE_ENV=production npm run build

# ---- Stage 2: Runtime (nginx) ----
FROM nginx:1.27-alpine AS runtime

# Replace default nginx config with SPA-friendly one
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built static assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

# nginx image already has a proper CMD and handles signals correctly