// ──────────────────────────────────────────
// GRABH Engine — yt-dlp Wrapper
// ──────────────────────────────────────────

import { existsSync } from "fs";

const COOKIES_FILE = process.env.COOKIES_FILE || "";
const COOKIES_BROWSER = process.env.COOKIES_BROWSER || ""; // e.g. "chrome", "firefox", "safari"

/**
 * Build base yt-dlp args with cookie/auth support
 */
function baseArgs(): string[] {
  const args: string[] = ["yt-dlp", "--no-warnings", "--extractor-retries", "3"];

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
  formats: VideoFormat[];
  best_url: string | null;
}

/**
 * Get video metadata using yt-dlp --dump-json
 */
export async function getVideoInfo(url: string): Promise<VideoInfo> {
  const args = [...baseArgs(), "--dump-json", url];

  const proc = Bun.spawn(args, {
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    throw new Error(`yt-dlp failed: ${stderr.trim() || "Unknown error"}`);
  }

  const raw = JSON.parse(stdout);

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
  const { resolve } = await import("path");

  // Always use absolute path
  const absDir = resolve(outputDir);
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

  const proc = Bun.spawn(args, {
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    throw new Error(`Download failed: ${stderr.trim() || "Unknown error"}`);
  }

  const filePath = stdout.trim().split("\n").pop()?.trim();
  if (!filePath || !existsSync(filePath)) {
    throw new Error("Download completed but file not found on disk");
  }

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
