FROM node:24-slim AS base

WORKDIR /app
COPY . .
RUN npm ci
RUN npx tsc

FROM node:24-slim AS runner
WORKDIR /app
COPY --from=base ./app/dist ./dist
COPY package*.json ./
ENV NODE_ENV=production
RUN npm ci

ENV TZ=Europe/Helsinki

CMD [ "node", "./dist/index.js" ]