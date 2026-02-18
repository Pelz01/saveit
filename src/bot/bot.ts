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

/* 
  Progress bar helper
  Generates a visual progress bar string
*/
function progressBar(percent: number): string {
  const filled = Math.round(percent / 10);
  const empty = 10 - filled;
  return "▓".repeat(filled) + "░".repeat(empty) + ` ${percent}%`;
}

export async function startBot(token: string) {
  const bot = new Telegraf(token);

  // ── Set bot menu commands ──
  bot.telegram.setMyCommands([
    { command: "start", description: "👋 Start here" },
    { command: "help", description: "❓ How to use" },
    { command: "supported", description: "📺 Supported sites" },
    { command: "status", description: "📊 Bot status" },
  ]);

  // ── /start command ──
  bot.start((ctx) => {
    ctx.reply(
      `✨ *Welcome to Save Bot* ✨\n\n` +
      `Just send me a link, and I'll download the video for you\\! 🎬\n\n` +
      `_Works with YouTube, Instagram, TikTok, X, and more\\._\n\n` +
      `👇 *Try it out:*\n` +
      `/help — See how it works\n` +
      `/status — Check server health`,
      { parse_mode: "MarkdownV2" }
    );
  });

  // ── /help command ──
  bot.help((ctx) => {
    ctx.reply(
      `❓ *How to use*\n\n` +
      `1\\. Paste a video link\n` +
      `2\\. Wait a moment for the magic 🪄\n` +
      `3\\. Get your video\\! 📥\n\n` +
      `*Good to know:*\n` +
      `• Max file size: 50MB\n` +
      `• I can handle most social media sites\\.\n\n` +
      `_Ready when you are\\!_`,
      { parse_mode: "MarkdownV2" }
    );
  });

  // ── /supported command ──
  bot.command("supported", (ctx) => {
    ctx.reply(
      `📺 *Supported Platforms*\n\n` +
      `✅ YouTube\n` +
      `✅ Instagram\n` +
      `✅ TikTok\n` +
      `✅ X \\(Twitter\\)\n` +
      `✅ Reddit\n` +
      `✅ Threads\n\n` +
      `_And many others\\! Give it a try\\._`,
      { parse_mode: "MarkdownV2" }
    );
  });

  // ── /status command ──
  bot.command("status", async (ctx) => {
    const q = downloadQueue.status;
    ctx.reply(
      `📊 *System Status*\n\n` +
      `🟢 Service: Online\n` +
      `📥 Active Downloads: ${q.active}\n` +
      `⏳ Queue: ${q.waiting}\n\n` +
      `_Everything is running smoothly\\!_`,
      { parse_mode: "MarkdownV2" }
    );
  });

  // ── Handle any text message with a URL ──
  bot.on(message("text"), async (ctx) => {
    const text = ctx.message.text;
    const urls = text.match(URL_REGEX);

    if (!urls || urls.length === 0) {
      // Friendly nudge if no link found
      await ctx.reply(
        `🤔 *I didn't see a link there\\.*\n\nPlease send a valid video URL so I can save it for you\\!`,
        { parse_mode: "MarkdownV2" }
      );
      return;
    }

    const url = urls[0];

    // Show "searching" status
    const statusMsg = await ctx.reply("🔍 _Looking for your video\\.\\.\\._", {
      parse_mode: "MarkdownV2",
    });

    try {
      // Get video info first
      const info = await getVideoInfo(url);

      // ── Start download with progress updates ──
      const queueStatus = downloadQueue.status;
      const queueMsg =
        queueStatus.waiting > 0
          ? `\n⏳ _You are #${queueStatus.waiting + 1} in the queue_`
          : "";

      // Show initial download status with video details
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        statusMsg.message_id,
        undefined,
        `🎬 *${escapeMd(info.title)}*\n` +
        `👤 ${escapeMd(info.uploader)} • ⏱ ${escapeMd(info.duration_string)}\n\n` +
        `⬇️ Downloading\\.\\.\\.${queueMsg}\n${progressBar(0)}`,
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
            `🎬 *${escapeMd(info.title)}*\n` +
            `👤 ${escapeMd(info.uploader)} • ⏱ ${escapeMd(info.duration_string)}\n\n` +
            `⬇️ Downloading\\.\\.\\.\n${progressBar(currentPercent)}`,
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
          `⚠️ *File too large* \\(${(fileSize / 1024 / 1024).toFixed(1)}MB\\)\n\n` +
          `🎬 _${escapeMd(info.title)}_\n` +
          `Unfortunately, Telegram won't let me send files larger than 50MB\\. 😔`,
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
          `🎬 *${escapeMd(info.title)}*\n` +
          `👤 ${escapeMd(info.uploader)} • ⏱ ${escapeMd(info.duration_string)}\n\n` +
          `✅ Download finished\\!\n${progressBar(100)}\n\n` +
          `_Sending it to you now\\.\\.\\._`,
          { parse_mode: "MarkdownV2" }
        )
        .catch(() => { });

      // Send the video
      await ctx.replyWithVideo(
        { source: filePath } as InputFile,
        {
          caption: `🎬 *${escapeMd(info.title)}*\n` +
            `👤 ${escapeMd(info.uploader)}\n` +
            `⏱ ${escapeMd(info.duration_string)}`,
          parse_mode: "MarkdownV2",
        }
      ).catch((err) => {
        console.error("[Bot Reply Error]", err);
        ctx.reply("❌ Oops, I couldn't send that video\\. It might be an invalid format\\.", { parse_mode: "MarkdownV2" }).catch(() => { });
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
          `❌ *Oops, something went wrong*\n\n` +
          `_${escapeMd(err.message || "Unknown error")}_\n\n` +
          `💡 _Please try again or check /supported sites\\._`,
          { parse_mode: "MarkdownV2" }
        )
        .catch(() => {
          ctx.reply(`❌ Oops, failed to download\\.\n\n${escapeMd(err.message)}`, { parse_mode: "MarkdownV2" }).catch(() => { });
        });
    }
  });

  // ── Deployment Logic: Polling vs Webhook ──
  const domain = process.env.RENDER_EXTERNAL_URL; // e.g. https://my-app.onrender.com
  let hookPath = "";

  if (domain) {
    // 🚀 Production: Use Webhook
    hookPath = `/telegraf/${bot.secretPathComponent()}`;
    const webhookUrl = `${domain}${hookPath}`;

    console.log(`  🚀 Webhook Mode Active`);
    console.log(`  🔗 Hook URL: ${webhookUrl}`);

    // Set Telegram webhook (must happen before server starts listening)
    await bot.telegram.setWebhook(webhookUrl);
  } else {
    // 💻 Development: Use Polling
    console.log("  🔄 Polling Mode Active");
    // Clear any old webhooks first to ensure polling works
    await bot.telegram.deleteWebhook();
    bot.launch({ dropPendingUpdates: true });
  }

  // Graceful shutdown
  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));

  return { bot, hookPath };
}
