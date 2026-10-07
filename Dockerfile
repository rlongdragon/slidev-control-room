FROM node:24-bookworm AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
RUN npx playwright install --with-deps chromium

COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/server ./server
COPY --from=build /app/public ./public
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/decks ./decks
COPY --from=build /app/dist ./dist
COPY --from=build /app/vite.config.mjs ./vite.config.mjs

RUN mkdir -p /app/data && chown -R node:node /app
USER node

EXPOSE 3000
CMD ["npm", "start"]
