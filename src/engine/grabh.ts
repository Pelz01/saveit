// ──────────────────────────────────────────
// SAVE Engine — yt-dlp Wrapper (Node.js)
// ──────────────────────────────────────────

import { existsSync } from "fs";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const COOKIES_FILE = process.env.COOKIES_FILE || "";
const COOKIES_BROWSER = process.env.COOKIES_BROWSER || ""; // e.g. "chrome", "firefox", "safari"

/**
 * Build base yt-dlp args with cookie/auth support
 */
function baseArgs(): string[] {
  let binary = "yt-dlp";

  // Try to resolve local binary relative to this file
  // Current file: src/engine/grabh.ts
  // Target binary: bin/yt-dlp.exe (root/bin/yt-dlp.exe)
  const localBin = resolve(__dirname, "../../bin/yt-dlp.exe");

  if (existsSync(localBin)) {
    binary = localBin;
    console.log(`[Engine] Using local binary: ${binary}`);
  }

  const args: string[] = [binary, "--no-warnings", "--extractor-retries", "3"];

  // Cookie file takes priority
  if (COOKIES_FILE && existsSync(COOKIES_FILE)) {
    args.push("--cookies", COOKIES_FILE);
  } else if (COOKIES_BROWSER) {
    args.push("--cookies-from-browser", COOKIES_BROWSER);
  }

  return args;
}

export interface VideoFormat {
  format_id: string;
  ext: string;
  resolution: string;
  filesize: number | null;
  url: string;
  vcodec: string;
  acodec: string;
}

export interface VideoInfo {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  duration: number;
  duration_string: string;
  uploader: string;
  view_count: number;
  webpage_url: string;
  extractor: string;
  filesize_approx: number | null;
  formats: VideoFormat[];
  best_url: string | null;
}

/**
 * Get video metadata using yt-dlp --dump-json
 */
export async function getVideoInfo(url: string): Promise<VideoInfo> {
  const args = [...baseArgs(), "--dump-json", url];

  const raw: any = await new Promise((resolve, reject) => {
    const proc = spawn(args[0], args.slice(1));

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`yt-dlp failed: ${stderr.trim() || "Unknown error"}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (e: any) {
        reject(new Error(`Failed to parse yt-dlp output: ${e.message}`));
      }
    });

    proc.on("error", (err) => {
      reject(err);
    });
  });

  // Extract usable formats (mp4 with both video + audio)
  const formats: VideoFormat[] = (raw.formats || [])
    .filter(
      (f: any) =>
        f.ext === "mp4" && f.vcodec !== "none" && f.acodec !== "none"
    )
    .map((f: any) => ({
      format_id: f.format_id,
      ext: f.ext,
      resolution: f.resolution || `${f.width}x${f.height}`,
      filesize: f.filesize || f.filesize_approx || null,
      url: f.url,
      vcodec: f.vcodec,
      acodec: f.acodec,
    }));

  // Find the best mp4 URL
  const bestFormat = formats.length > 0 ? formats[formats.length - 1] : null;

  return {
    id: raw.id,
    title: raw.title || "Untitled",
    description: raw.description || "",
    thumbnail: raw.thumbnail || "",
    duration: raw.duration || 0,
    duration_string: raw.duration_string || formatDuration(raw.duration || 0),
    uploader: raw.uploader || raw.channel || "Unknown",
    view_count: raw.view_count || 0,
    webpage_url: raw.webpage_url || url,
    extractor: raw.extractor || "unknown",
    filesize_approx: raw.filesize_approx || raw.filesize || bestFormat?.filesize || null,
    formats,
    best_url: bestFormat?.url || null,
  };
}

/**
 * Download video using yt-dlp and return the local file path
 */
export async function downloadVideo(
  url: string,
  outputDir: string
): Promise<string> {
  const { mkdirSync } = await import("fs");
  const { resolve: pathResolve } = await import("path");

  // Always use absolute path
  const absDir = pathResolve(outputDir);
  if (!existsSync(absDir)) {
    mkdirSync(absDir, { recursive: true });
  }

  const outputTemplate = `${absDir}/%(id)s.%(ext)s`;

  const args = [
    ...baseArgs(),
    "-f", "best[ext=mp4]/best",
    "-o", outputTemplate,
    "--no-warnings",
    "--print", "after_move:filepath",
    url,
  ];

  const filePath: string = await new Promise((resolve, reject) => {
    const proc = spawn(args[0], args.slice(1));

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Download failed: ${stderr.trim() || "Unknown error"}`));
        return;
      }

      const path = stdout.trim().split("\n").pop()?.trim();
      if (!path || !existsSync(path)) {
        reject(new Error("Download completed but file not found on disk"));
        return;
      }
      resolve(path);
    });

    proc.on("error", (err) => {
      reject(err);
    });
  });

  return filePath;
}

/**
 * Format seconds into MM:SS or HH:MM:SS
 */
function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${mins}:${String(secs).padStart(2, "0")}`;
}
