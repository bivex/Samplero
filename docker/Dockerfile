FROM node:22-alpine

# Use cache for apk
RUN --mount=type=cache,target=/var/cache/apk \
    apk add --no-cache \
    build-base \
    gcc \
    autoconf \
    automake \
    libtool \
    make \
    python3 \
    git \
    openssl

WORKDIR /opt/app

# Set environment
ENV NODE_ENV=development

# Copy package files first to leverage caching
COPY package.json package-lock.json* ./

# Use cache for npm
RUN --mount=type=cache,target=/root/.npm \
    npm install --legacy-peer-deps --ignore-scripts

# Rebuild only better-sqlite3
RUN npm rebuild better-sqlite3

# Copy the rest of the application
COPY . .

# Build Strapi admin panel
RUN npm run build

EXPOSE 1337

CMD ["npm", "run", "develop"]
