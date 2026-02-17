// ──────────────────────────────────────────
// GRABH API Server — Bun.serve
// ──────────────────────────────────────────

import { getVideoInfo, downloadVideo } from "../engine/grabh";
import { downloadQueue } from "../engine/queue";
import { getMimeType } from "./mime";
import { join } from "path";
import { incrementGlobalDownloads, getGlobalDownloadCount } from "../firebase-admin";

const PUBLIC_DIR = join(import.meta.dir, "../../public");
const DOWNLOAD_DIR = process.env.DOWNLOAD_DIR || "./downloads";
const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || "200", 10);

export function startServer(port: number) {
  const server = Bun.serve({
    port,
    idleTimeout: 255,
    reusePort: true,
    async fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;

      // ── CORS headers ──
      const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      };

      if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
      }

      // ── API: Server config & queue status ──
      if (path === "/api/status" && req.method === "GET") {
        const totalDownloads = await getGlobalDownloadCount();
        return Response.json(
          {
            maxFileSizeMB: MAX_FILE_SIZE_MB,
            queue: downloadQueue.status,
            totalDownloads,
          },
          { headers: corsHeaders }
        );
      }

      // ── API: Firebase config (from env) ──
      if (path === "/api/config" && req.method === "GET") {
        return Response.json(
          {
            apiKey: process.env.FIREBASE_API_KEY || "",
            authDomain: process.env.FIREBASE_AUTH_DOMAIN || "",
            projectId: process.env.FIREBASE_PROJECT_ID || "",
            storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "",
            messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "",
            appId: process.env.FIREBASE_APP_ID || "",
          },
          { headers: corsHeaders }
        );
      }

      // ── API: Get video info ──
      if (path === "/api/grabh" && req.method === "POST") {
        try {
          const body = await req.json();
          const videoUrl = body.url;

          if (!videoUrl || typeof videoUrl !== "string") {
            return Response.json(
              { error: "Missing or invalid 'url' field" },
              { status: 400, headers: corsHeaders }
            );
          }

          const info = await getVideoInfo(videoUrl);
          return Response.json(
            { success: true, data: info, maxFileSizeMB: MAX_FILE_SIZE_MB },
            { headers: corsHeaders }
          );
        } catch (err: any) {
          console.error("[API Error]", err.message);
          return Response.json(
            { error: err.message || "Failed to fetch video info" },
            { status: 500, headers: corsHeaders }
          );
        }
      }

      // ── API: Download video (queued) ──
      if (path === "/api/download" && req.method === "GET") {
        try {
          const videoUrl = url.searchParams.get("url");

          if (!videoUrl) {
            return Response.json(
              { error: "Missing 'url' query parameter" },
              { status: 400, headers: corsHeaders }
            );
          }

          // Queue the download
          const filePath = await downloadQueue.enqueue(videoUrl, (u) =>
            downloadVideo(u, DOWNLOAD_DIR)
          );

          const file = Bun.file(filePath);
          const fileSize = file.size;
          const fileSizeMB = fileSize / 1024 / 1024;

          // Check max file size
          if (fileSizeMB > MAX_FILE_SIZE_MB) {
            try { (await import("fs")).unlinkSync(filePath); } catch {}
            return Response.json(
              { error: `File too large (${fileSizeMB.toFixed(1)}MB). Max allowed: ${MAX_FILE_SIZE_MB}MB` },
              { status: 413, headers: corsHeaders }
            );
          }

          // Sanitize filename
          const rawName = filePath.split("/").pop() || "video.mp4";
          const safeName = rawName
            .replace(/[^\w\s\-_.()]/g, "")
            .replace(/\s+/g, "_")
            .trim() || "video";
          const fileName = safeName.endsWith(".mp4") ? safeName : `${safeName}.mp4`;

          // Read into memory then clean up temp file
          const buffer = await file.arrayBuffer();
          try { (await import("fs")).unlinkSync(filePath); } catch {}

          return new Response(buffer, {
            headers: {
              ...corsHeaders,
              "Content-Type": "video/mp4",
              "Content-Length": String(fileSize),
              "Content-Disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
            },
          });
        } catch (err: any) {
          console.error("[Download Error]", err.message);
          return Response.json(
            { error: err.message || "Failed to download video" },
            { status: 500, headers: corsHeaders }
          );
        }
      }

      // ── API: Increment download count ──
      if (path === "/api/download/count" && req.method === "POST") {
        await incrementGlobalDownloads();
        const totalDownloads = await getGlobalDownloadCount();
        return Response.json(
          { totalDownloads },
          { headers: corsHeaders }
        );
      }

      // ── Static Files ──
      try {
        let filePath = join(PUBLIC_DIR, path === "/" ? "index.html" : path);
        const file = Bun.file(filePath);

        if (await file.exists()) {
          return new Response(file, {
            headers: {
              "Content-Type": getMimeType(filePath),
              "Cache-Control": "public, max-age=3600",
            },
          });
        }
      } catch {
        // Fall through to 404
      }

      // ── 404 ──
      return Response.json({ error: "Not found" }, { status: 404 });
    },
  });

  console.log(`\n  ✨ GRABH Server running at http://localhost:${server.port}`);
  console.log(`  📦 Max file size: ${MAX_FILE_SIZE_MB}MB | Queue: ${downloadQueue.status.maxConcurrent} concurrent\n`);
  return server;
}
