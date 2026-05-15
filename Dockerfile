FROM node:24-slim AS build

WORKDIR /app
COPY package*.json ./
COPY apps/web/package*.json apps/web/
COPY apps/server/package*.json apps/server/
RUN npm install

COPY . .
RUN npm run build

FROM node:24-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps ./apps

EXPOSE 8787
CMD ["npm", "start"]
