// ──────────────────────────────────────────
// GRABH Telegram Bot — Telegraf
// ──────────────────────────────────────────

import { Telegraf, Context } from "telegraf";
import { message } from "telegraf/filters";
import { getVideoInfo, downloadVideo } from "../engine/grabh";
import { downloadQueue } from "../engine/queue";
import { InputFile } from "telegraf/types";

const DOWNLOAD_DIR = process.env.DOWNLOAD_DIR || "./downloads";
const URL_REGEX = /https?:\/\/[^\s]+/gi;

export function startBot(token: string) {
  const bot = new Telegraf(token);

  // ── /start command ──
  bot.start((ctx) => {
    ctx.reply(
      `👋 *Welcome to Grabh!*\n\nPaste any video link and I'll grab it for you.\n\n_Supports YouTube, Instagram, TikTok, Twitter/X, and 1000+ sites._`,
      { parse_mode: "Markdown" }
    );
  });

  // ── /help command ──
  bot.help((ctx) => {
    ctx.reply(
      `🎬 *How to use Grabh*\n\nJust send me a video link from any supported platform.\n\nI'll download it and send the MP4 right here.\n\n*Supported:* YouTube, Instagram, TikTok, Twitter/X, Reddit, Facebook, and more.`,
      { parse_mode: "Markdown" }
    );
  });

  // ── Handle any text message with a URL ──
  bot.on(message("text"), async (ctx) => {
    const text = ctx.message.text;
    const urls = text.match(URL_REGEX);

    if (!urls || urls.length === 0) {
      await ctx.reply("🔗 Please send me a valid video link.");
      return;
    }

    const url = urls[0];

    // Show "searching" status
    const statusMsg = await ctx.reply("🔍 _Searching..._", {
      parse_mode: "Markdown",
    });

    try {
      // Get video info first
      const info = await getVideoInfo(url);

      // Update status
      const queueStatus = downloadQueue.status;
      const queueMsg = queueStatus.waiting > 0
        ? ` (queued: ${queueStatus.waiting} ahead of you)`
        : "";
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        statusMsg.message_id,
        undefined,
        `📥 _Downloading "${info.title}"...${queueMsg}_`,
        { parse_mode: "Markdown" }
      );

      // Download via queue
      const filePath = await downloadQueue.enqueue(url, (u) =>
        downloadVideo(u, DOWNLOAD_DIR)
      );
      const file = Bun.file(filePath);
      const fileSize = file.size;

      // Telegram limit: 50MB for bots
      if (fileSize > 50 * 1024 * 1024) {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          statusMsg.message_id,
          undefined,
          `⚠️ *File too large for Telegram* (${(fileSize / 1024 / 1024).toFixed(1)}MB)\n\n📹 _${info.title}_\n⏱ ${info.duration_string}`,
          { parse_mode: "Markdown" }
        );
        return;
      }

      // Delete status message
      await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});

      // Send the video
      await ctx.replyWithVideo(
        { source: filePath } as InputFile,
        {
          caption: `📹 *${info.title}*\n👤 ${info.uploader}\n⏱ ${info.duration_string}`,
          parse_mode: "Markdown",
        }
      );

      // Clean up downloaded file
      const { unlinkSync } = await import("fs");
      try {
        unlinkSync(filePath);
      } catch {
        // Ignore cleanup errors
      }
    } catch (err: any) {
      console.error("[Bot Error]", err.message);

      await ctx.telegram
        .editMessageText(
          ctx.chat.id,
          statusMsg.message_id,
          undefined,
          `❌ *Couldn't grab that one.*\n\n_${err.message || "Unknown error"}_`,
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
