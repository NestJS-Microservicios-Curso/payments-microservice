FROM node:22-alpine AS deps
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci

FROM node:22-alpine AS dev
WORKDIR /usr/src/app
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY . .
CMD ["npm", "run", "start:dev"]

FROM node:22-alpine AS builder
WORKDIR /usr/src/app
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY . .
RUN npm run build
RUN npm prune --production

FROM node:22-alpine AS runner
WORKDIR /usr/src/app
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist

USER node

EXPOSE 3003

CMD ["node", "dist/main.js"]
