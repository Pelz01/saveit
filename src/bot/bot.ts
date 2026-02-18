// ──────────────────────────────────────────
// GRABH Telegram Bot — Telegraf
// ──────────────────────────────────────────

import { Telegraf, Markup } from "telegraf";
import { getVideoInfo, downloadVideo } from "../engine/save";
import { downloadQueue } from "../engine/queue";
import { message } from "telegraf/filters";
import { InputFile } from "telegraf/types";


const DOWNLOAD_DIR = process.env.DOWNLOAD_DIR || "./downloads";
const URL_REGEX = /https?:\/\/[^\s]+/gi;

// Progress bar helper
function progressBar(percent: number): string {
  const filled = Math.round(percent / 10);
  const empty = 10 - filled;
  return "▓".repeat(filled) + "░".repeat(empty) + ` ${percent}%`;
}

export function startBot(token: string) {
  const bot = new Telegraf(token);

  // ── Set bot menu commands ──
  bot.telegram.setMyCommands([
    { command: "start", description: "👋 Start the bot" },
    { command: "help", description: "❓ How to use Grabh" },
    { command: "supported", description: "📺 Supported platforms" },
    { command: "status", description: "📊 Server & queue status" },
  ]);

  // ── /start command ──
  bot.start((ctx) => {
    ctx.reply(
      `👋 *Welcome to Grabh\\!*\n\n` +
      `Paste any video link and I'll grab it for you\\.\n\n` +
      `_Supports YouTube, Instagram, TikTok, Twitter/X, and 1000\\+ sites\\._\n\n` +
      `📋 *Commands:*\n` +
      `/help — How to use\n` +
      `/supported — See all platforms\n` +
      `/status — Queue \\& server info`,
      { parse_mode: "MarkdownV2" }
    );
  });

  // ── /help command ──
  bot.help((ctx) => {
    ctx.reply(
      `🎬 *How to use Grabh*\n\n` +
      `1\\. Send me a video link\n` +
      `2\\. I'll find the video info\n` +
      `3\\. Download \\& send the MP4 right here\n\n` +
      `*Limits:*\n` +
      `• Max file size: 50MB \\(Telegram limit\\)\n` +
      `• Concurrent downloads are queued\n\n` +
      `💡 _Just paste \\& go\\!_`,
      { parse_mode: "MarkdownV2" }
    );
  });

  // ── /supported command ──
  bot.command("supported", (ctx) => {
    ctx.reply(
      `📺 *Supported Platforms*\n\n` +
      `✅ YouTube\n` +
      `✅ Instagram \\(Reels, Stories\\)\n` +
      `✅ TikTok\n` +
      `✅ Twitter / X\n` +
      `✅ Reddit\n` +
      `✅ Facebook\n` +
      `✅ Vimeo\n` +
      `✅ Dailymotion\n` +
      `✅ Twitch Clips\n` +
      `✅ Pinterest\n` +
      `✅ And 1000\\+ more\\!\n\n` +
      `_Just send any link and I'll try to grab it\\._`,
      { parse_mode: "MarkdownV2" }
    );
  });

  // ── /status command ──
  bot.command("status", async (ctx) => {
    const q = downloadQueue.status;
    ctx.reply(
      `📊 *Server Status*\n\n` +
      `🔄 Active downloads: ${q.active}\n` +
      `⏳ Queued: ${q.waiting}\n` +
      `🔧 Max concurrent: ${q.maxConcurrent}\n\n` +
      `_Server is running\\._`,
      { parse_mode: "MarkdownV2" }
    );
  });

  // ── Handle any text message with a URL ──
  bot.on(message("text"), async (ctx) => {
    const text = ctx.message.text;
    const urls = text.match(URL_REGEX);

    if (!urls || urls.length === 0) {
      await ctx.reply(
        "🔗 Send me a video link from any supported platform.\n\n_Type /supported to see the full list._",
        { parse_mode: "Markdown" }
      );
      return;
    }

    const url = urls[0];



    // Show "searching" status
    const statusMsg = await ctx.reply("🔍 _Searching for your video…_", {
      parse_mode: "Markdown",
    });

    try {
      // Get video info first
      const info = await getVideoInfo(url);

      // ── Start download with progress updates ──
      const queueStatus = downloadQueue.status;
      const queueMsg =
        queueStatus.waiting > 0
          ? `\n⏳ _Queue position: ${queueStatus.waiting + 1}_`
          : "";

      // Show initial download status with video details
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        statusMsg.message_id,
        undefined,
        `📹 *${info.title}*\n👤 ${info.uploader} • ⏱ ${info.duration_string}\n\n📥 Downloading…${queueMsg}\n${progressBar(0)}`,
        { parse_mode: "Markdown" }
      );

      // Animate progress while download runs
      let downloadDone = false;
      let currentPercent = 0;

      const progressInterval = setInterval(async () => {
        if (downloadDone) return;

        // Simulate progress (accelerates then slows near end)
        if (currentPercent < 30) {
          currentPercent += Math.floor(Math.random() * 8 + 3);
        } else if (currentPercent < 60) {
          currentPercent += Math.floor(Math.random() * 5 + 2);
        } else if (currentPercent < 85) {
          currentPercent += Math.floor(Math.random() * 3 + 1);
        } else if (currentPercent < 95) {
          currentPercent += 1;
        }
        currentPercent = Math.min(currentPercent, 95);

        try {
          await ctx.telegram.editMessageText(
            ctx.chat.id,
            statusMsg.message_id,
            undefined,
            `📹 *${info.title}*\n👤 ${info.uploader} • ⏱ ${info.duration_string}\n\n📥 Downloading…\n${progressBar(currentPercent)}`,
            { parse_mode: "Markdown" }
          );
        } catch {
          // Ignore edit errors (message not modified, etc.)
        }
      }, 3000);

      // Download via queue
      const filePath = await downloadQueue.enqueue(url, (u) =>
        downloadVideo(u, DOWNLOAD_DIR)
      );

      downloadDone = true;
      clearInterval(progressInterval);

      const stats = await import("fs/promises").then(fs => fs.stat(filePath));
      const fileSize = stats.size;

      // Telegram limit: 50MB for bots
      if (fileSize > 50 * 1024 * 1024) {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          statusMsg.message_id,
          undefined,
          `⚠️ *File too large for Telegram* (${(fileSize / 1024 / 1024).toFixed(1)}MB)\n\n📹 _${info.title}_\n⏱ ${info.duration_string}\n\n_Telegram bots can only send files up to 50MB._`,
          { parse_mode: "Markdown" }
        );
        // Clean up
        try {
          (await import("fs/promises")).unlink(filePath);
        } catch { }
        return;
      }

      // Show 100% before sending
      await ctx.telegram
        .editMessageText(
          ctx.chat.id,
          statusMsg.message_id,
          undefined,
          `📹 *${info.title}*\n👤 ${info.uploader} • ⏱ ${info.duration_string}\n\n✅ Download complete!\n${progressBar(100)}\n\n_Sending to you…_`,
          { parse_mode: "Markdown" }
        )
        .catch(() => { });

      // Send the video
      await ctx.replyWithVideo(
        { source: filePath } as InputFile,
        {
          caption: `📹 *${info.title}*\n👤 ${info.uploader}\n⏱ ${info.duration_string}`,
          parse_mode: "Markdown",
        }
      );



      // Delete progress message after video is sent
      await ctx.telegram
        .deleteMessage(ctx.chat.id, statusMsg.message_id)
        .catch(() => { });

      // Clean up downloaded file
      try {
        (await import("fs/promises")).unlink(filePath);
      } catch { }
    } catch (err: any) {
      console.error("[Bot Error]", err.message);

      await ctx.telegram
        .editMessageText(
          ctx.chat.id,
          statusMsg.message_id,
          undefined,
          `❌ *Couldn't grab that one.*\n\n_${err.message || "Unknown error"}_\n\n💡 _Try another link or check /supported_`,
          { parse_mode: "Markdown" }
        )
        .catch(() => {
          ctx.reply(`❌ *Couldn't grab that one.*\n\n_${err.message}_`, {
            parse_mode: "Markdown",
          });
        });
    }
  });

  // ── Launch bot ──
  bot.launch({
    dropPendingUpdates: true,
  });

  console.log("  🤖 Grabh Bot is live!\n");

  // Graceful shutdown
  process.on("SIGINT", () => bot.stop("SIGINT"));
  process.on("SIGTERM", () => bot.stop("SIGTERM"));

  return bot;
}
