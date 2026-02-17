# Use the official Bun image
FROM oven/bun:latest

# Set working directory
WORKDIR /app

# Install system dependencies for yt-dlp (Python is required)
RUN apt-get update && apt-get install -y python3 python3-pip curl && \
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

# Copy package files and install dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy the rest of the application
COPY . .

# Expose the API port
EXPOSE 3000

# Start the application (both server and bot run from src/index.ts)
CMD ["bun", "run", "src/index.ts"]
