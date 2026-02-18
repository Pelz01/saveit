// ──────────────────────────────────────────
// SAVE API Server — Node.js
// ──────────────────────────────────────────

import { getVideoInfo, downloadVideo } from "../engine/save";
import { downloadQueue } from "../engine/queue";
import { getMimeType } from "./mime";
import { join } from "path";


import { createServer } from "http";
import { stat, readFile, unlink } from "fs/promises";
import { createReadStream } from "fs";

import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PUBLIC_DIR = join(__dirname, "../../public");
const DOWNLOAD_DIR = process.env.DOWNLOAD_DIR || "./downloads";
const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || "200", 10);

// ── Server Start ──
export function startServer(port: number, webhookCallback?: (req: any, res: any) => void, webhookPath?: string) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const path = url.pathname;

    // ── Telegram Webhook Routing ──
    if (webhookCallback && webhookPath && path === webhookPath && req.method === "POST") {
      // console.log(`[Webhook] Update received at ${path}`);
      webhookCallback(req, res);
      return;
    }

    console.log(`[${req.method}] ${path}`); // Log regular requests

    // ── CORS headers ──
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // Helper to send JSON
    const sendJson = (data: any, status = 200) => {
      res.writeHead(status, { "Content-Type": "application/json", ...corsHeaders });
      res.end(JSON.stringify(data));
    };

    // Helper to send Error
    const sendError = (message: string, status = 500) => {
      sendJson({ error: message }, status);
    };

    if (req.method === "OPTIONS") {
      res.writeHead(204, corsHeaders);
      res.end();
      return;
    }

    // ── API: Server config & queue status ──
    if (path === "/api/status" && req.method === "GET") {
      const totalDownloads = 0; // Stateless
      sendJson({
        maxFileSizeMB: MAX_FILE_SIZE_MB,
        queue: downloadQueue.status,
      });
      return;
    }

    // ── API: Get video info ──
    if (path === "/api/save" && req.method === "POST") {
      let body = "";
      req.on("data", chunk => body += chunk);
      req.on("end", async () => {
        try {
          const data = JSON.parse(body);
          const videoUrl = data.url;

          if (!videoUrl || typeof videoUrl !== "string") {
            sendError("Missing or invalid 'url' field", 400);
            return;
          }

          const info = await getVideoInfo(videoUrl);
          sendJson({ success: true, data: info, maxFileSizeMB: MAX_FILE_SIZE_MB });
        } catch (err: any) {
          console.error("[API Error]", err);
          // Send detailed error for debugging
          sendError(`Failed to fetch video info: ${err.message}`, 500);
        }
      });
      return;
    }

    // ── API: Download video (queued) ──
    if (path === "/api/download" && req.method === "GET") {
      try {
        const videoUrl = url.searchParams.get("url");

        if (!videoUrl) {
          sendError("Missing 'url' query parameter", 400);
          return;
        }

        // Queue the download
        const filePath = await downloadQueue.enqueue(videoUrl, (u) =>
          downloadVideo(u, DOWNLOAD_DIR)
        );

        const stats = await stat(filePath);
        const fileSize = stats.size;
        const fileSizeMB = fileSize / 1024 / 1024;

        // Check max file size
        if (fileSizeMB > MAX_FILE_SIZE_MB) {
          try { await unlink(filePath); } catch { }
          sendError(`File too large (${fileSizeMB.toFixed(1)}MB). Max allowed: ${MAX_FILE_SIZE_MB}MB`, 413);
          return;
        }

        // Sanitize filename
        const rawName = filePath.split("/").pop() || "video.mp4";
        const safeName = rawName
          .replace(/[^\w\s\-_.()]/g, "")
          .replace(/\s+/g, "_")
          .trim() || "video";
        const fileName = safeName.endsWith(".mp4") ? safeName : `${safeName}.mp4`;

        // Stream file
        res.writeHead(200, {
          ...corsHeaders,
          "Content-Type": "video/mp4",
          "Content-Length": String(fileSize),
          "Content-Disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        });

        const stream = createReadStream(filePath);
        stream.pipe(res);

        stream.on("end", async () => {
          try { await unlink(filePath); } catch { }
        });
        stream.on("error", async () => {
          try { await unlink(filePath); } catch { }
        });

      } catch (err: any) {
        console.error("[Download Error]", err.message);
        sendError(err.message || "Failed to download video");
      }
      return;
    }


    // ── Static Files ──
    try {
      let filePath = join(PUBLIC_DIR, path === "/" ? "index.html" : path);
      // Security check to prevent directory traversal
      if (!filePath.startsWith(PUBLIC_DIR)) {
        sendError("Forbidden", 403);
        return;
      }

      const stats = await stat(filePath);
      if (stats.isFile()) {
        res.writeHead(200, {
          "Content-Type": getMimeType(filePath),
          "Cache-Control": "public, max-age=3600",
        });
        createReadStream(filePath).pipe(res);
        return;
      }
    } catch {
      // Fall through to 404
    }

    // ── 404 ──
    sendError("Not found", 404);
  });

  server.listen(port, () => {
    console.log(`\n  ✨ SAVE Server running at http://localhost:${port}`);
    console.log(`  📦 Max file size: ${MAX_FILE_SIZE_MB}MB | Queue: ${downloadQueue.status.maxConcurrent} concurrent\n`);

    // ── Keep-Alive Ping (Prevent Sleep) ──
    const pingUrl = process.env.RENDER_EXTERNAL_URL;
    if (pingUrl) {
      console.log(`  ⏰ Keep-Alive active: Pinging ${pingUrl} every 14m`);
      setInterval(() => {
        import("http").then(http => {
          import("https").then(https => {
            const client = pingUrl.startsWith("https") ? https : http;
            client.get(pingUrl, (res) => {
              // console.log(`[Keep-Alive] Ping status: ${res.statusCode}`);
            }).on("error", (err) => {
              console.error(`[Keep-Alive] Ping failed: ${err.message}`);
            });
          });
        });
      }, 14 * 60 * 1000); // 14 minutes
    }
  });
}
