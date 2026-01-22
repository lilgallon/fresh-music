# Build Stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* ./
RUN npm ci

# Copy all files
COPY . .

# Disables telemetry
ENV NEXT_TELEMETRY_DISABLED 1

# Build the application
# Note: NEXT_PUBLIC_YOUTUBE_API_KEY should be passed as a build arg if needed for static generation
# but here it's mainly used client-side. If any page is pre-rendered and uses it, it needs to be set.
ARG NEXT_PUBLIC_YOUTUBE_API_KEY
ENV NEXT_PUBLIC_YOUTUBE_API_KEY=$NEXT_PUBLIC_YOUTUBE_API_KEY

RUN npm run build

# Production Stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files from builder
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]
