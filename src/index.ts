// ──────────────────────────────────────────
// SAVE — Main Entry Point
// ──────────────────────────────────────────

import { startServer } from "./server/index";
import { startBot } from "./bot/bot";

// Load configuration
const PORT = parseInt(process.env.PORT || "3001", 10);
const BOT_TOKEN = process.env.BOT_TOKEN || "";

console.log(`
  ╔═══════════════════════════════════════╗
  ║           ✨  S A V E  ✨             ║
  ║      The Minimalist Downloader        ║
  ╚═══════════════════════════════════════╝
`);

// Main Async Wrapper
(async () => {
  let webhookCallback: any = undefined;
  let hookPath = "";

  // 1. Start Telegram bot (if token provided)
  if (BOT_TOKEN && BOT_TOKEN !== "your_telegram_bot_token_here") {
    // startBot now returns the bot instance and optional hookPath
    const { bot, hookPath: path } = await startBot(BOT_TOKEN);

    if (path) {
      // If hookPath exists, we are in Webhook mode.
      hookPath = path;
      webhookCallback = bot.webhookCallback(path);
    }
  } else {
    console.log(
      "  ⚠️  No BOT_TOKEN set — Telegram bot disabled.\n" +
      "     Set BOT_TOKEN in your .env file to enable it.\n"
    );
  }

  // 2. Start HTTP server (passing webhook info if active)
  startServer(PORT, webhookCallback, hookPath);
})();
