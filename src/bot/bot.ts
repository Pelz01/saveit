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
// Helper to escape MarkdownV2 chars
function escapeMd(text: string): string {
  // Escapes all special characters in MarkdownV2
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
}

export function startBot(token: string) {
  const bot = new Telegraf(token);

  // ── Set bot menu commands ──
  bot.telegram.setMyCommands([
    { command: "start", description: "👋 START PROTOCOL" },
    { command: "help", description: "❓ PROTOCOL INFO" },
    { command: "supported", description: "📺 TARGET LIST" },
    { command: "status", description: "📊 SYSTEM LOAD" },
  ]);

  // ── /start command ──
  bot.start((ctx) => {
    ctx.reply(
      `🔮 *SAVE SYSTEM ONLINE*\n\n` +
      `Send a link\\. I will acquire the media\\.\n\n` +
      `_Compatible with YouTube, Instagram, TikTok, X, and others\\._\n\n` +
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
      `_Execute\\._`,
      { parse_mode: "MarkdownV2" }
    );
  });

  // ── /supported command ──
  bot.command("supported", (ctx) => {
    ctx.reply(
      `📡 *TARGETS*\n\n` +
      `\\[\\+\\] YouTube\n` +
      `\\[\\+\\] Instagram\n` +
      `\\[\\+\\] TikTok\n` +
      `\\[\\+\\] X \\(Twitter\\)\n` +
      `\\[\\+\\] Reddit\n` +
      `\\[\\+\\] Threads\n\n` +
      `_Universal extractor active\\._`,
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
      `_Online\\._`,
      { parse_mode: "MarkdownV2" }
    );
  });

  // ── Handle any text message with a URL ──
  bot.on(message("text"), async (ctx) => {
    const text = ctx.message.text;
    const urls = text.match(URL_REGEX);

    if (!urls || urls.length === 0) {
      await ctx.reply(
        `⚡ *NO LINK DETECTED*\n\nTransmit a valid URL to begin operation\\.`,
        { parse_mode: "MarkdownV2" }
      );
      return;
    }

    const url = urls[0];

    // Show "searching" status
    const statusMsg = await ctx.reply("📡 _RESOLVING RESOURCE\\.\\.\\._", {
      parse_mode: "MarkdownV2",
    });

    try {
      // Get video info first
      const info = await getVideoInfo(url);

      // ── Start download with progress updates ──
      const queueStatus = downloadQueue.status;
      const queueMsg =
        queueStatus.waiting > 0
          ? `\n⏳ _QUEUE POSITION: ${queueStatus.waiting + 1}_`
          : "";

      // Show initial download status with video details
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        statusMsg.message_id,
        undefined,
        `📼 *${escapeMd(info.title)}*\n` +
        `👤 ${escapeMd(info.uploader)} • ⏱ ${escapeMd(info.duration_string)}\n\n` +
        `⬇️ ACQUIRING\\.\\.\\.${queueMsg}\n${progressBar(0)}`,
        { parse_mode: "MarkdownV2" }
      ).catch(() => { });

      // Animate progress while download runs
      let downloadDone = false;
      let currentPercent = 0;

      const progressInterval = setInterval(async () => {
        if (downloadDone) return;

        // Simulate progress
        if (currentPercent < 30) currentPercent += Math.floor(Math.random() * 8 + 3);
        else if (currentPercent < 60) currentPercent += Math.floor(Math.random() * 5 + 2);
        else if (currentPercent < 85) currentPercent += Math.floor(Math.random() * 3 + 1);
        else if (currentPercent < 95) currentPercent += 1;
        currentPercent = Math.min(currentPercent, 95);

        try {
          await ctx.telegram.editMessageText(
            ctx.chat.id,
            statusMsg.message_id,
            undefined,
            `📼 *${escapeMd(info.title)}*\n` +
            `👤 ${escapeMd(info.uploader)} • ⏱ ${escapeMd(info.duration_string)}\n\n` +
            `⬇️ ACQUIRING\\.\\.\\.\n${progressBar(currentPercent)}`,
            { parse_mode: "MarkdownV2" }
          );
        } catch { }
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
          `⚠️ *FILE SIZE EXCEEDED* \\(${(fileSize / 1024 / 1024).toFixed(1)}MB\\)\n\n` +
          `📼 _${escapeMd(info.title)}_\n` +
          `⏱ ${escapeMd(info.duration_string)}\n\n` +
          `_System cannot transmit files over 50MB via Telegram protocol\\._`,
          { parse_mode: "MarkdownV2" }
        ).catch(() => { });
        try { (await import("fs/promises")).unlink(filePath); } catch { }
        return;
      }

      // Show 100% before sending
      await ctx.telegram
        .editMessageText(
          ctx.chat.id,
          statusMsg.message_id,
          undefined,
          `📼 *${escapeMd(info.title)}*\n` +
          `👤 ${escapeMd(info.uploader)} • ⏱ ${escapeMd(info.duration_string)}\n\n` +
          `✅ ACQUISITION COMPLETE\n${progressBar(100)}\n\n` +
          `_Transmitting\\.\\.\\._`,
          { parse_mode: "MarkdownV2" }
        )
        .catch(() => { });

      // Send the video
      await ctx.replyWithVideo(
        { source: filePath } as InputFile,
        {
          caption: `📼 *${escapeMd(info.title)}*\n` +
            `👤 ${escapeMd(info.uploader)}\n` +
            `⏱ ${escapeMd(info.duration_string)}`,
          parse_mode: "MarkdownV2",
        }
      ).catch((err) => {
        console.error("[Bot Reply Error]", err);
        ctx.reply("❌ TRANSMISSION ERROR\\. Format invalid or size limit reached\\.", { parse_mode: "MarkdownV2" }).catch(() => { });
      });

      // Delete progress message
      await ctx.telegram
        .deleteMessage(ctx.chat.id, statusMsg.message_id)
        .catch(() => { });

      // Clean up
      try { (await import("fs/promises")).unlink(filePath); } catch { }

    } catch (err: any) {
      console.error("[Bot Error]", err.message);
      // @ts-ignore
      if (typeof progressInterval !== 'undefined') clearInterval(progressInterval);

      await ctx.telegram
        .editMessageText(
          ctx.chat.id,
          statusMsg.message_id,
          undefined,
          `❌ *ACQUISITION FAILED*\n\n` +
          `_${escapeMd(err.message || "Unknown system error")}_\n\n` +
          `💡 _Verify URL or check /supported_`,
          { parse_mode: "MarkdownV2" }
        )
        .catch(() => {
          ctx.reply(`❌ ACQUISITION FAILED\n\n${escapeMd(err.message)}`, { parse_mode: "MarkdownV2" }).catch(() => { });
        });
    }
  });

  // ── Launch bot ──
  bot.launch({
    dropPendingUpdates: true,
  });

  console.log("  🤖 SAVE SYSTEM is live!\n");

  // Graceful shutdown
  process.on("SIGINT", () => bot.stop("SIGINT"));
  process.on("SIGTERM", () => bot.stop("SIGTERM"));

  return bot;
}
