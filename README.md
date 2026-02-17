# GRABH ✨

**The Minimalist Video Downloader** — Paste a link. Get the video.

A universal video downloader powered by **Bun + TypeScript + yt-dlp**, featuring a clean web UI and a Telegram bot.

---

## Prerequisites

- [Bun](https://bun.sh) `v1.0+`
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) installed and in PATH

```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash

# Install yt-dlp (macOS)
brew install yt-dlp

# Install yt-dlp (Linux)
pip install yt-dlp
```

## Setup

```bash
# Install dependencies
bun install

# Copy env file
cp .env.example .env

# Edit .env with your config
# (Add BOT_TOKEN if you want the Telegram bot)
```

## Run

```bash
# Development (with hot reload)
bun run dev

# Production
bun run start
```

Open **http://localhost:3000** to use the web UI.

## Telegram Bot

1. Create a bot via [@BotFather](https://t.me/BotFather)
2. Add the token to `.env` as `BOT_TOKEN`
3. Start the server — the bot launches automatically

## Deploy with PM2

```bash
# Install PM2 globally
npm install -g pm2

# Start with ecosystem config
pm2 start ecosystem.config.cjs

# Save and setup auto-start
pm2 save
pm2 startup
```

## Project Structure

```
Grabh/
├── public/           # Frontend (served by Bun)
│   ├── index.html
│   └── styles.css
├── src/
│   ├── index.ts      # Entry point
│   ├── engine/
│   │   └── grabh.ts  # yt-dlp wrapper
│   ├── server/
│   │   ├── index.ts  # API + static server
│   │   └── mime.ts   # MIME helper
│   └── bot/
│       └── bot.ts    # Telegraf bot
├── .env.example
├── ecosystem.config.cjs
└── package.json
```

## License

MIT
