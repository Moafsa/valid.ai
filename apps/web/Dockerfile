FROM node:20-alpine AS base
RUN apk add --no-cache openssl libc6-compat

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/db/package.json ./packages/db/
COPY packages/types/package.json ./packages/types/
COPY apps/web/package.json ./apps/web/

RUN npm install --legacy-peer-deps

# Build the application
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED 1

RUN npx prisma generate --schema=packages/db/prisma/schema.prisma

RUN npm run build -w apps/web

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/apps/web/public ./public
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

# Next.js standalone output tracing (@vercel/nft) doesn't reliably pick up
# Prisma's native query engine binary (it's dynamically resolved at
# runtime, not a static require() the tracer can see) — copy it explicitly
# to every path the Prisma client searches at runtime, musl-only since
# that's the only one this Alpine-based runner image can execute.
COPY --from=builder --chown=nextjs:nodejs /app/packages/db/node_modules/.prisma/client/libquery_engine-linux-musl-openssl-3.0.x.so.node ./packages/db/node_modules/.prisma/client/
COPY --from=builder --chown=nextjs:nodejs /app/packages/db/node_modules/.prisma/client/libquery_engine-linux-musl-openssl-3.0.x.so.node ./apps/web/packages/db/node_modules/.prisma/client/

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["sh", "-c", "if [ -f apps/web/server.js ]; then node apps/web/server.js; else node server.js; fi"]
