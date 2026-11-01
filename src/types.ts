export type Lang = "tr" | "en";

export type ArchiveFormat = "zip" | "7z" | "tar" | "tar.gz" | "tar.xz" | "tar.bz2" | "rar";

export interface ArchiveEntry {
  path: string;
  name: string;
  isDir: boolean;
  size: number;
  packed: number;
  ratio: number | null;
  mtime: string;
  crc: string;
  encrypted: boolean;
  method: string;
  attributes: string;
}

export interface ArchiveInfo {
  path: string;
  name: string;
  type: string;
  rawType: string;
  solid: boolean;
  volumes: number;
  method: string;
  physicalSize: number;
  archiveSize: number;
  isRar: boolean;
  tarCompressed: boolean;
  multiVolume: boolean;
  headersEncrypted: boolean;
  hasEncrypted: boolean;
  hasUnsafePaths: boolean;
  supportsModification: boolean;
  entries: ArchiveEntry[];
}

export type ListResult =
  | { status: "ok"; info: ArchiveInfo }
  | { status: "password"; wrong: boolean }
  | { status: "error"; notArchive: boolean; summary: string; output: string };

export interface JobResult {
  code: number;
  ok: boolean;
  cancelled: boolean;
  wrongPassword: boolean;
  notArchive: boolean;
  summary: string;
  output: string;
}

export interface AppSettings {
  language: Lang;
  default_format: ArchiveFormat;
  default_level: number;
  reveal_after_extract: boolean;
  rar_path: string;
  recent: string[];
}

export interface CompressOptions {
  archivePath: string;
  format: ArchiveFormat;
  level: number;
  password: string;
  encryptNames: boolean;
  solid: boolean;
  volumeSize: string;
  recovery: boolean;
  deleteAfter: boolean;
}

export interface RarStatus {
  available: boolean;
  path: string | null;
  version: string | null;
  downloadPage: string;
}

// Mirrors FORMATS in electron/sevenzip.cjs: what each creatable format supports.
export const FORMAT_CAPS: Record<
  ArchiveFormat,
  { ext: string; password: boolean; encryptNames: boolean; solid: boolean; volumes: boolean; level: boolean; append: boolean; recovery?: boolean }
> = {
  "7z": { ext: "7z", password: true, encryptNames: true, solid: true, volumes: true, level: true, append: true },
  zip: { ext: "zip", password: true, encryptNames: false, solid: false, volumes: true, level: true, append: true },
  tar: { ext: "tar", password: false, encryptNames: false, solid: false, volumes: false, level: false, append: true },
  "tar.gz": { ext: "tar.gz", password: false, encryptNames: false, solid: false, volumes: false, level: true, append: false },
  "tar.xz": { ext: "tar.xz", password: false, encryptNames: false, solid: false, volumes: false, level: true, append: false },
  "tar.bz2": { ext: "tar.bz2", password: false, encryptNames: false, solid: false, volumes: false, level: true, append: false },
  rar: { ext: "rar", password: true, encryptNames: true, solid: true, volumes: true, level: true, append: true, recovery: true },
};

export const FORMAT_ORDER: ArchiveFormat[] = ["zip", "7z", "tar", "tar.gz", "tar.xz", "tar.bz2", "rar"];
