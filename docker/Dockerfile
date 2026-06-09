FROM node:22-alpine

# Install dependencies for better-sqlite3 and other native modules
RUN apk add --no-cache \
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

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install --legacy-peer-deps --ignore-scripts
RUN npm rebuild better-sqlite3

# Copy project files
COPY . .

# Build Strapi admin panel
RUN npm run build

EXPOSE 1337

CMD ["npm", "run", "develop"]
