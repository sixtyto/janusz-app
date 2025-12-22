FROM node:24-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build

FROM node:24-alpine AS runner

WORKDIR /app

COPY --from=builder /app/.output .output

RUN apk add --no-cache curl
RUN apk add --no-cache git

EXPOSE 3000

CMD [ "node", ".output/server/index.mjs" ]
