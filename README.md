# SAVE ✨

**The Minimalist Video Downloader** — Paste a link. Get the video.

A universal video downloader powered by **Node.js + yt-dlp**, featuring a high-end "Industrial" UI and a Telegram bot.

---

## 🚀 Deployment (The Easy Way)

**This project requires a server.** It cannot run on Vercel or Netlify because it needs `yt-dlp` (Python/FFmpeg) to process videos.

### [Read the Deployment Guide](./DEPLOY.md)

We recommend **Railway** or **Render** (Free Tier available).

1. Fork this repo.
2. Create a new project on Railway/Render.
3. Connect your repo.
4. **Done.** (The included `Dockerfile` handles everything).

---

## 🛠️ Development

### Prerequisites
- Node.js v18+
- `yt-dlp` (installed and in PATH)

### Quick Start
```bash
# Install dependencies
npm install

# Run development server
npm run dev
```
Open **http://localhost:3001**

### Environment Variables
Rename `.env.example` to `.env`:
```env
PORT=3001
MAX_FILE_SIZE_MB=200
BOT_TOKEN=your_telegram_bot_token  # Optional
```

---

## telegram Bot
1. Add `BOT_TOKEN` to `.env`
2. Start the server (`npm start`)
3. Bot launches automatically.

## License
MIT
