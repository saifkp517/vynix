FROM oven/bun:1.1.0-alpine

WORKDIR /app

RUN apk add --no-cache \
        nodejs \
        npm

COPY package.json bun.lockb* ./

RUN bun install && npm install

COPY . .

RUN npx prisma generate

EXPOSE 3000 4000

CMD ["bun", "run", "start"]

