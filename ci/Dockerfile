# Use a stable base with Node preinstalled (or build your own)
FROM node:18-bullseye-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
  build-essential \
  python3 \
  make \
  g++ \
  git \
  curl \
  fakeroot \
  dpkg-dev \
  devscripts \
  libusb-1.0-0-dev \
  libudev-dev \
  libsqlite3-dev \
  libasound2-dev \
  pkg-config \
  && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy your app source code (assumes .dockerignore includes node_modules)
COPY . .

# Install Node dependencies and rebuild native modules
RUN npm install && npx electron-rebuild

# Build the .deb package
RUN npm run make

# Save final artifacts
CMD ["bash"]
