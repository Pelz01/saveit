// ──────────────────────────────────────────
// GRABH — Main Entry Point
// ──────────────────────────────────────────

import { startServer } from "./server/index";
import { startBot } from "./bot/bot";

// Load configuration
const PORT = parseInt(process.env.PORT || "3000", 10);
const BOT_TOKEN = process.env.BOT_TOKEN || "";

console.log(`
  ╔═══════════════════════════════════════╗
  ║           ✨  G R A B H  ✨           ║
  ║      The Minimalist Downloader        ║
  ╚═══════════════════════════════════════╝
`);

// Start HTTP server (always)
startServer(PORT);

// Start Telegram bot (only if token is provided)
if (BOT_TOKEN && BOT_TOKEN !== "your_telegram_bot_token_here") {
  startBot(BOT_TOKEN);
} else {
  console.log(
    "  ⚠️  No BOT_TOKEN set — Telegram bot disabled.\n" +
    "     Set BOT_TOKEN in your .env file to enable it.\n"
  );
}
