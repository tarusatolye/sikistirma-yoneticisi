import { Lang } from "./types";

export function formatSize(bytes: number, lang: Lang): string {
  if (!bytes || bytes <= 0) return "0 B";
  const dec = (n: number, d: number) => {
    const s = n.toFixed(d);
    return lang === "tr" ? s.replace(".", ",") : s;
  };
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return dec(bytes / 1024, 1) + " KB";
  if (bytes < 1024 * 1024 * 1024) return dec(bytes / (1024 * 1024), 1) + " MB";
  return dec(bytes / (1024 * 1024 * 1024), 2) + " GB";
}

// 7-Zip prints "2026-11-01 21:49:46".
export function formatDate(mtime: string, lang: Lang): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(mtime || "");
  if (!m) return mtime || "";
  return lang === "tr" ? `${m[3]}.${m[2]}.${m[1]} ${m[4]}:${m[5]}` : `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}`;
}

export function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "--:--";
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export function baseName(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] || p;
}
