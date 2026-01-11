FROM emscripten/emsdk:3.1.51 AS wasm-builder

WORKDIR /src

RUN npm init -y
RUN npm install \
    tree-sitter-cli@0.24.3 \
    tree-sitter-bash \
    tree-sitter-c \
    tree-sitter-c-sharp \
    tree-sitter-cpp \
    tree-sitter-css \
    tree-sitter-dart \
    tree-sitter-elixir \
    tree-sitter-elm \
    tree-sitter-go \
    tree-sitter-haskell \
    tree-sitter-html \
    tree-sitter-java \
    tree-sitter-javascript \
    tree-sitter-json \
    tree-sitter-julia \
    tree-sitter-kotlin \
    tree-sitter-lua \
    tree-sitter-ocaml \
    tree-sitter-pascal \
    tree-sitter-perl \
    tree-sitter-php \
    tree-sitter-python \
    tree-sitter-r \
    tree-sitter-ruby \
    tree-sitter-rust \
    tree-sitter-scala \
    tree-sitter-solidity \
    tree-sitter-swift \
    tree-sitter-toml \
    tree-sitter-typescript \
    tree-sitter-vue \
    tree-sitter-yaml \
    tree-sitter-zig

COPY scripts/build-wasms.js ./build-wasms.js
RUN mkdir /out
# Add node_modules/.bin to PATH for tree-sitter cli
ENV PATH="/src/node_modules/.bin:${PATH}"
RUN node build-wasms.js

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

RUN apk add --no-cache curl
RUN apk add --no-cache git

EXPOSE 3000

CMD [ "node", ".output/server/index.mjs" ]
