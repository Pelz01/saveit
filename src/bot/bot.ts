// ──────────────────────────────────────────
// GRABH Telegram Bot — Telegraf
// ──────────────────────────────────────────

import { Telegraf, Markup } from "telegraf";
import { getVideoInfo, downloadVideo } from "../engine/save";
import { downloadQueue } from "../engine/queue";
import { message } from "telegraf/filters";
import { InputFile } from "telegraf/types";
import { join } from "path";
import { readFile, writeFile, mkdir } from "fs/promises";
import * as crypto from "crypto";


const DOWNLOAD_DIR = process.env.DOWNLOAD_DIR || "./downloads";
const DATA_DIR = process.env.DATA_DIR || "./data";
const URL_REGEX = /https?:\/\/[^\s]+/gi;

async function getStatsPath(): Promise<string> {
  const newPath = join(DATA_DIR, "stats.json");
  const oldPath = join(DOWNLOAD_DIR, "stats.json");
  await mkdir(DATA_DIR, { recursive: true }).catch(() => {});
  const { existsSync } = await import("fs");
  if (existsSync(oldPath) && !existsSync(newPath)) {
    try {
      const content = await readFile(oldPath, "utf-8");
      await writeFile(newPath, content, "utf-8");
    } catch {}
  }
  return newPath;
}

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

interface StatsSchema {
  totalDownloads: number;
  daily: { date: string; hashes: string[] };
  weekly: { week: string; hashes: string[] };
  monthly: { month: string; hashes: string[]; downloads?: number };
  monthlyHistory?: { [month: string]: { uniqueUsers: number; downloads: number } };
}

function getWeekIdentifier(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

async function trackStats(chatId: number) {
  try {
    const statsPath = await getStatsPath();

    let stats: StatsSchema = {
      totalDownloads: 0,
      daily: { date: "", hashes: [] },
      weekly: { week: "", hashes: [] },
      monthly: { month: "", hashes: [], downloads: 0 },
      monthlyHistory: {},
    };

    try {
      const raw = await readFile(statsPath, "utf-8");
      stats = JSON.parse(raw);
    } catch {
      // File doesn't exist or is invalid
    }

    const now = new Date();
    const todayStr = now.toISOString().split("T")[0]; // YYYY-MM-DD
    const weekStr = getWeekIdentifier(now); // YYYY-Www
    const monthStr = todayStr.substring(0, 7); // YYYY-MM

    stats.monthlyHistory = stats.monthlyHistory || {};

    // Restore July 2026 baseline if missing
    if (!stats.monthlyHistory["2026-07"]) {
      stats.monthlyHistory["2026-07"] = {
        uniqueUsers: 10,
        downloads: 200,
      };
      if (stats.totalDownloads < 200) {
        stats.totalDownloads = 200 + (stats.monthly ? (stats.monthly.downloads || 0) : 0);
      }
    }

    if (stats.daily.date !== todayStr) {
      stats.daily = { date: todayStr, hashes: [] };
    }
    if (stats.weekly.week !== weekStr) {
      stats.weekly = { week: weekStr, hashes: [] };
    }
    if (stats.monthly.month !== monthStr) {
      // Save old month stats to history
      const oldMonth = stats.monthly.month || "2026-07";
      if (oldMonth && oldMonth !== monthStr) {
        stats.monthlyHistory[oldMonth] = {
          uniqueUsers: stats.monthly.hashes ? stats.monthly.hashes.length : 4,
          downloads: stats.monthly.downloads || 0,
        };

        // Keep only the last 12 months
        const months = Object.keys(stats.monthlyHistory).sort();
        while (months.length > 12) {
          const oldest = months.shift()!;
          delete stats.monthlyHistory[oldest];
        }
      }
      stats.monthly = { month: monthStr, hashes: [], downloads: 0 };
    }

    const salt = process.env.STATS_SALT || "saveit_default_secure_salt_123987";
    const hash = crypto.createHmac("sha256", salt).update(chatId.toString()).digest("hex");

    if (!stats.daily.hashes.includes(hash)) {
      stats.daily.hashes.push(hash);
    }
    if (!stats.weekly.hashes.includes(hash)) {
      stats.weekly.hashes.push(hash);
    }
    if (!stats.monthly.hashes.includes(hash)) {
      stats.monthly.hashes.push(hash);
    }

    stats.totalDownloads++;
    stats.monthly.downloads = (stats.monthly.downloads || 0) + 1;

    await writeFile(statsPath, JSON.stringify(stats, null, 2), "utf-8");
  } catch (err) {
    console.error("[Stats Error]", err);
  }
}


export async function startBot(token: string) {
  const bot = new Telegraf(token, { handlerTimeout: 9_000_000 });

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

  // ── /admin command ──
  bot.command("admin", async (ctx) => {
    const userId = ctx.from?.id;
    const username = ctx.from?.username;

    const allowedId = process.env.ADMIN_USER_ID ? parseInt(process.env.ADMIN_USER_ID, 10) : 1940921885;
    const allowedUsername = process.env.ADMIN_USERNAME || "pelzthegreat";

    if (userId !== allowedId && username !== allowedUsername) {
      // Unauthorized: silently ignore
      return;
    }

    try {
      const statsPath = await getStatsPath();
      let stats: StatsSchema = {
        totalDownloads: 0,
        daily: { date: "", hashes: [] },
        weekly: { week: "", hashes: [] },
        monthly: { month: "", hashes: [] },
      };

      try {
        const raw = await readFile(statsPath, "utf-8");
        stats = JSON.parse(raw);
      } catch {
        // File doesn't exist or is invalid
      }

      // Restore July 2026 baseline if missing
      stats.monthlyHistory = stats.monthlyHistory || {};
      if (!stats.monthlyHistory["2026-07"]) {
        stats.monthlyHistory["2026-07"] = {
          uniqueUsers: 10,
          downloads: 200,
        };
        if (stats.totalDownloads < 200) {
          stats.totalDownloads = 200 + (stats.monthly ? (stats.monthly.downloads || 0) : 0);
        }
      }

      const dailyCount = stats.daily.hashes.length;
      const weeklyCount = stats.weekly.hashes.length;
      const monthlyCount = stats.monthly.hashes.length;
      const total = stats.totalDownloads;

      let historyText = "";
      if (Object.keys(stats.monthlyHistory).length > 0) {
        // Show newest months first
        const sortedMonths = Object.keys(stats.monthlyHistory).sort().reverse();
        historyText = `\n📅 *Monthly History \\(Last 12 Months\\):*\n` +
          sortedMonths.map(m => `• *${escapeMd(m)}:* ${stats.monthlyHistory![m].uniqueUsers} users • ${stats.monthlyHistory![m].downloads} downloads`).join("\n");
      } else {
        historyText = `\n📅 *Monthly History:* _No past months archived yet_`;
      }

      await ctx.reply(
        `📊 *Bot Statistics Dashboard*\n\n` +
        `📈 *Unique Users:*\n` +
        `• Today: ${dailyCount}\n` +
        `• This Week: ${weeklyCount}\n` +
        `• This Month: ${monthlyCount}\n\n` +
        `📥 *Total Downloads:* ${total}\n` +
        historyText,
        { parse_mode: "MarkdownV2" }
      );
    } catch (err: any) {
      console.error("[Admin Command Error]", err);
      ctx.reply(`❌ Error loading statistics: ${escapeMd(err.message)}`, { parse_mode: "MarkdownV2" }).catch(() => {});
    }
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

      // ── Start download with static status update ──
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
        `⚡ Downloading video\\.\\.\\.${queueMsg}`,
        { parse_mode: "MarkdownV2" }
      ).catch(() => { });

      // Download via queue
      const filePath = await downloadQueue.enqueue(url, (u) =>
        downloadVideo(u, DOWNLOAD_DIR)
      );

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

      // Show sending status
      await ctx.telegram
        .editMessageText(
          ctx.chat.id,
          statusMsg.message_id,
          undefined,
          `🎬 *${escapeMd(info.title)}*\n` +
          `👤 ${escapeMd(info.uploader)} • ⏱ ${escapeMd(info.duration_string)}\n\n` +
          `📤 Sending video to you\\.\\.\\.`,
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
      ).then(async () => {
        await trackStats(ctx.chat.id);
      }).catch((err) => {
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
