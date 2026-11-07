FROM node:26-bookworm-slim AS build

WORKDIR /workspace

RUN npm install --global pnpm@12.18.0

COPY . .

RUN pnpm install --filter @volition/api... --frozen-lockfile
RUN pnpm --filter @volition/api... run build
RUN pnpm --filter @volition/api --prod deploy /deploy
RUN mkdir -p /deploy/dist && cp -R apps/api/dist/. /deploy/dist/

FROM node:26-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /deploy/ ./

EXPOSE 3000

CMD ["node", "dist/src/app.js"]
