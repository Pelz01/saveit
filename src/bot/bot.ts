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
      `🔮 *SAVE SYSTEM ONLINE*\n\n` +
      `Send a link. I will acquire the media.\n\n` +
      `_Compatible with YouTube, Instagram, TikTok, X, and others._\n\n` +
      `cmds:\n` +
      `/help — Protocol info\n` +
      `/status — System load`,
      { parse_mode: "MarkdownV2" }
    );
  });

  // ── /help command ──
  bot.help((ctx) => {
    ctx.reply(
      `📋 *PROTOCOL*\n\n` +
      `1\\. Transmit URL\n` +
      `2\\. Processing\\.\\.\\.\n` +
      `3\\. Receive File\n\n` +
      `*PARAMETERS:*\n` +
      `• Max Size: 50MB\n` +
      `• Queue: Active\n\n` +
      `_Execute._`,
      { parse_mode: "MarkdownV2" }
    );
  });

  // ── /supported command ──
  bot.command("supported", (ctx) => {
    ctx.reply(
      `📡 *TARGETS*\n\n` +
      `[+] YouTube\n` +
      `[+] Instagram\n` +
      `[+] TikTok\n` +
      `[+] X (Twitter)\n` +
      `[+] Reddit\n` +
      `[+] Threads\n\n` +
      `_Universal extractor active._`,
      { parse_mode: "MarkdownV2" }
    );
  });

  // ── /status command ──
  bot.command("status", async (ctx) => {
    const q = downloadQueue.status;
    ctx.reply(
      `⚙️ *SYSTEM STATUS*\n\n` +
      `Processing: ${q.active}\n` +
      `Pending: ${q.waiting}\n` +
      `Capacity: ${q.maxConcurrent}\n\n` +
      `_Online._`,
      { parse_mode: "MarkdownV2" }
    );
  });

  // ── Handle any text message with a URL ──
  bot.on(message("text"), async (ctx) => {
    const text = ctx.message.text;
    const urls = text.match(URL_REGEX);

    if (!urls || urls.length === 0) {
      await ctx.reply(
        "⚡ *NO LINK DETECTED*\n\nTransmit a valid URL to begin operation.",
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
      ).catch(() => { });

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
        ).catch(() => { });
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
      ).catch((err) => {
        console.error("[Bot Reply Error]", err);
        ctx.reply("❌ Error sending video. It might be too large or invalid format.").catch(() => { });
      });



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

      // Clear interval if error occurred during download
      // @ts-ignore
      if (typeof progressInterval !== 'undefined') clearInterval(progressInterval);

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
          }).catch(() => { });
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
