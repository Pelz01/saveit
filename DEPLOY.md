# Deployment Guide

This project is a full-stack Node.js application (not a static site). It requires a server to run `yt-dlp` for video processing.

## fastest way: Railway (Recommended)

Railway is the easiest way to deploy this because it detects the `Dockerfile` automatically.

1.  **Sign Up**: Go to [railway.app](https://railway.app/) and log in with GitHub.
2.  **New Project**: Click **"New Project"** -> **"Deploy from GitHub repo"**.
3.  **Select Repo**: Choose `Pelz01/saveit`.
4.  **Deploy**: Railway will automatically detect the `Dockerfile` and start building.
5.  **Domain**:
    - Go to **Settings** -> **Networking**.
    - Click **"Generate Domain"** (you'll get something like `save-production.up.railway.app`).

## Alternative: Render (Free Tier)

1.  **Sign Up**: Go to [render.com](https://render.com/).
2.  **New Web Service**: Click **"New"** -> **"Web Service"**.
3.  **Connect Repo**: Select `Pelz01/saveit`.
4.  **Runtime**: Select **"Docker"** (crucial step).
5.  **Plan**: Select "Free".
6.  **Deploy**: improvements might be slower on free tier, but it works.

## Why not Vercel/Netlify?
These are "Serverless" platforms. They cannot run the heavy `ffmpeg` and `python` tools required to process video downloads. You need a container-based host like Railway or Render.
