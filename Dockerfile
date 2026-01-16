FROM ubuntu:24.04 AS wasm-builder

WORKDIR /src

RUN apt-get update && apt-get install -y nodejs npm curl

RUN npm init -y
RUN npm install tsx typescript web-tree-sitter tree-sitter-cli
RUN npm install --legacy-peer-deps --ignore-scripts \
    tree-sitter-bash \
    tree-sitter-c \
    tree-sitter-c-sharp \
    tree-sitter-cpp \
    tree-sitter-css \
    tree-sitter-dart \
    tree-sitter-elixir \
    tree-sitter-go \
    tree-sitter-haskell \
    tree-sitter-html \
    tree-sitter-java \
    tree-sitter-javascript \
    tree-sitter-json \
    tree-sitter-julia \
    tree-sitter-kotlin \
    tree-sitter-lua \
    tree-sitter-pascal \
    tree-sitter-php \
    tree-sitter-python \
    tree-sitter-ruby \
    tree-sitter-rust \
    tree-sitter-scala \
    tree-sitter-solidity \
    tree-sitter-toml \
    tree-sitter-typescript \
    tree-sitter-vue \
    tree-sitter-zig

COPY scripts/buildGrammars.ts ./scripts/buildGrammars.ts
COPY server/utils/treeSitterConfig.ts ./server/utils/treeSitterConfig.ts
RUN mkdir -p /out public/grammars
ENV PATH="/src/node_modules/.bin:${PATH}"
RUN npx tsx scripts/buildGrammars.ts
RUN cp public/grammars/*.wasm /out/

FROM node:24-alpine AS builder

WORKDIR /app

# Copy built grammars first so they are available for Nuxt build
# Create directory first
RUN mkdir -p public/grammars
COPY --from=wasm-builder /out/ public/grammars/

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build

FROM node:24-alpine AS runner

WORKDIR /app

COPY --from=builder /app/.output .output
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/drizzle.config.ts ./
COPY --from=builder /app/server/database/schema.ts ./server/database/schema.ts
COPY --from=builder /app/package.json ./

RUN npm install drizzle-kit drizzle-orm postgres dotenv --omit=dev

RUN apk add --no-cache curl git

EXPOSE 3000

CMD ["sh", "-c", "npx drizzle-kit migrate && node .output/server/index.mjs"]
