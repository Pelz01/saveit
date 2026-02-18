# Base Node.js image
FROM node:18-slim

# Install system dependencies (Python + ffmpeg for yt-dlp)
RUN apt-get update && \
    apt-get install -y python3 python3-pip ffmpeg curl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install yt-dlp
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install deps
RUN npm install

# Copy source
COPY . .

# Build (if necessary, currently using tsx directly)
# RUN npm run build

# Env vars
ENV PORT=3001
ENV DOWNLOAD_DIR=/tmp/downloads
ENV MAX_FILE_SIZE_MB=200

# Expose port
EXPOSE 3001

# Start
CMD ["npm", "start"]
