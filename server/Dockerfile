# ---- build stage ----
FROM node:22-slim AS build
WORKDIR /app

# Install deps first (better caching)
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY tsconfig*.json ./
COPY src ./src
RUN npm run build && test -f dist/index.js

# ---- runtime stage ----
FROM node:22-slim AS run
WORKDIR /app
ENV NODE_ENV=production

# Only prod deps
COPY package*.json ./
RUN npm ci --omit=dev

# Bring compiled output
COPY --from=build /app/dist ./dist

EXPOSE 2567
CMD ["npm", "run", "start"]
