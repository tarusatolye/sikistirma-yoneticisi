import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Folder,
  File,
  FileText,
  FileImage,
  FileAudio,
  FileVideo,
  FileArchive,
  FileCode,
  FileSpreadsheet,
  Lock,
  ArrowUp,
  ChevronUp,
  ChevronDown,
  FolderOutput,
  FolderInput,
  Trash2,
  Copy,
  ExternalLink,
  PackageOpen,
} from "lucide-react";
import { TreeNode } from "../tree";
import { T } from "../i18n";
import { Lang } from "../types";
import { formatDate, formatSize } from "../format";

// The name column takes the remaining width; the others are resizable and remembered, like the download list.
type ColKey = "encrypted" | "size" | "packed" | "ratio" | "mtime" | "crc";
export type SortKey = "name" | ColKey;
const FIXED: ColKey[] = ["encrypted", "size", "packed", "ratio", "mtime", "crc"];
const DEFAULT_WIDTHS: Record<ColKey, number> = { encrypted: 62, size: 96, packed: 96, ratio: 62, mtime: 136, crc: 88 };
const MIN_WIDTHS: Record<ColKey, number> = { encrypted: 44, size: 64, packed: 64, ratio: 48, mtime: 90, crc: 60 };
const NAME_MIN_WIDTH = 200;
const WIDTHS_KEY = "sy-column-widths";
const SORT_KEY = "sy-sort";

function loadWidths(): Record<ColKey, number> {
  try {
    const saved = JSON.parse(localStorage.getItem(WIDTHS_KEY) || "null");
    if (saved && typeof saved === "object") {
      const w = { ...DEFAULT_WIDTHS };
      for (const k of FIXED) if (typeof saved[k] === "number") w[k] = Math.max(MIN_WIDTHS[k], saved[k]);
      return w;
    }
  } catch {}
  return { ...DEFAULT_WIDTHS };
}

function loadSort(): { key: SortKey; asc: boolean } {
  try {
    const saved = JSON.parse(localStorage.getItem(SORT_KEY) || "null");
    if (saved && typeof saved.key === "string") return { key: saved.key, asc: saved.asc !== false };
  } catch {}
  return { key: "name", asc: true };
}

const EXT_ICONS: [RegExp, React.FC<{ size?: number; className?: string }>][] = [
  [/\.(png|jpe?g|gif|bmp|webp|svg|heic|tiff?|ico|psd)$/i, FileImage],
  [/\.(mp3|wav|flac|aac|ogg|m4a|wma|opus)$/i, FileAudio],
  [/\.(mp4|mkv|avi|mov|wmv|flv|webm|m4v)$/i, FileVideo],
  [/\.(zip|rar|7z|tar|gz|tgz|bz2|xz|zst|cab|iso|r\d\d|\d{3})$/i, FileArchive],
  [/\.(js|ts|tsx|jsx|json|html?|css|py|swift|c|cpp|h|java|go|rs|sh|xml|yml|yaml|cjs|mjs)$/i, FileCode],
  [/\.(xls|xlsx|csv|ods|numbers)$/i, FileSpreadsheet],
  [/\.(txt|md|pdf|docx?|rtf|odt|pages|epub)$/i, FileText],
];

function iconFor(node: TreeNode) {
  if (node.isDir) return <Folder size={16} className="text-[#a78bfa] shrink-0" />;
  const hit = EXT_ICONS.find(([re]) => re.test(node.name));
  const Icon = hit ? hit[1] : File;
  return <Icon size={16} className="text-[#8e95a5] shrink-0" />;
}

export type ContextAction = "open" | "extractTo" | "extractHere" | "delete" | "copyName";

interface ArchiveTableProps {
  t: T;
  lang: Lang;
  rows: TreeNode[];
  searchMode: boolean;
  location: string;
  canGoUp: boolean;
  onUp: () => void;
  selected: string[];
  onSelect: (paths: string[]) => void;
  onOpen: (node: TreeNode) => void;
  onContext: (action: ContextAction, nodes: TreeNode[]) => void;
  canModify: boolean;
  solid: boolean;
}

export const ArchiveTable: React.FC<ArchiveTableProps> = ({
  t,
  lang,
  rows,
  searchMode,
  location,
  canGoUp,
  onUp,
  selected,
  onSelect,
  onOpen,
  onContext,
  canModify,
  solid,
}) => {
  const [widths, setWidths] = useState(loadWidths);
  const [sort, setSort] = useState(loadSort);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const anchor = useRef<string | null>(null);

  useEffect(() => {
    try { localStorage.setItem(WIDTHS_KEY, JSON.stringify(widths)); } catch {}
  }, [widths]);
  useEffect(() => {
    try { localStorage.setItem(SORT_KEY, JSON.stringify(sort)); } catch {}
  }, [sort]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(null);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, []);

  const gridTemplateColumns = `minmax(${NAME_MIN_WIDTH}px, 1fr) ${FIXED.map((k) => `${widths[k]}px`).join(" ")}`;

  // Folders first, then by the chosen column.
  const sorted = useMemo(() => {
    const dir = sort.asc ? 1 : -1;
    const val = (n: TreeNode): string | number => {
      switch (sort.key) {
        case "encrypted": return n.encrypted ? 1 : 0;
        case "size": return n.size;
        case "packed": return n.packed;
        case "ratio": return n.size > 0 ? n.packed / n.size : 0;
        case "mtime": return n.mtime;
        case "crc": return n.crc;
        default: return n.name.toLocaleLowerCase(lang);
      }
    };
    return [...rows].sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      const va = val(a);
      const vb = val(b);
      if (va < vb) return -dir;
      if (va > vb) return dir;
      return a.name.localeCompare(b.name, lang, { numeric: true });
    });
  }, [rows, sort, lang]);

  const startResize = (column: ColKey, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const start = { ...widths };
    const idx = FIXED.indexOf(column);
    const left: ColKey | null = idx > 0 ? FIXED[idx - 1] : null;
    const tableWidth = tableRef.current?.clientWidth ?? Infinity;
    const fixedTotal = FIXED.reduce((a, k) => a + start[k], 0);
    const onMove = (ev: PointerEvent) => {
      let dx = ev.clientX - startX;
      dx = Math.min(dx, start[column] - MIN_WIDTHS[column]);
      if (left) dx = Math.max(dx, MIN_WIDTHS[left] - start[left]);
      else dx = Math.max(dx, NAME_MIN_WIDTH + fixedTotal + 32 - tableWidth);
      const next = { ...start, [column]: start[column] - dx };
      if (left) next[left] = start[left] + dx;
      setWidths(next);
    };
    const onUpPtr = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUpPtr);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = "col-resize";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUpPtr);
  };

  const resizeHandle = (column: ColKey) => (
    <div
      role="separator"
      aria-orientation="vertical"
      title={t.table.resizeHint}
      onPointerDown={(e) => startResize(column, e)}
      onDoubleClick={(e) => {
        e.stopPropagation();
        setWidths({ ...DEFAULT_WIDTHS });
      }}
      onClick={(e) => e.stopPropagation()}
      className="absolute -left-[3px] top-0 h-full w-[6px] cursor-col-resize z-10 group/handle"
    >
      <div className="mx-auto h-full w-px bg-[#2d323b] group-hover/handle:bg-[#8b5cf6] group-hover/handle:w-0.5" />
    </div>
  );

  const header = (key: SortKey, label: string, align: "left" | "right" = "left") => {
    const active = sort.key === key;
    return (
      <div
        key={key}
        onClick={() => setSort((s) => ({ key, asc: s.key === key ? !s.asc : true }))}
        className={`relative h-full flex items-center cursor-pointer hover:text-white ${key === "name" ? "pr-2" : "px-2"} ${
          align === "right" ? "justify-end" : ""
        } ${active ? "text-white" : ""}`}
      >
        {key !== "name" && resizeHandle(key as ColKey)}
        <span className="truncate">{label}</span>
        {active && (sort.asc ? <ChevronUp size={11} className="ml-0.5 shrink-0" /> : <ChevronDown size={11} className="ml-0.5 shrink-0" />)}
      </div>
    );
  };

  const handleRowClick = (node: TreeNode, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      onSelect(selected.includes(node.path) ? selected.filter((p) => p !== node.path) : [...selected, node.path]);
      anchor.current = node.path;
    } else if (e.shiftKey && anchor.current) {
      const a = sorted.findIndex((n) => n.path === anchor.current);
      const b = sorted.findIndex((n) => n.path === node.path);
      if (a >= 0 && b >= 0) {
        const [s, en] = a < b ? [a, b] : [b, a];
        onSelect(sorted.slice(s, en + 1).map((n) => n.path));
      } else onSelect([node.path]);
    } else {
      onSelect([node.path]);
      anchor.current = node.path;
    }
  };

  const selectedNodes = () => sorted.filter((n) => selected.includes(n.path));

  const menuItem = (icon: React.ReactNode, label: string, action: ContextAction, danger = false, disabled = false) => (
    <button
      key={action}
      disabled={disabled}
      onClick={() => {
        setMenu(null);
        onContext(action, selectedNodes());
      }}
      className={`w-full text-left px-3 py-1.5 flex items-center space-x-2 disabled:opacity-40 ${
        danger ? "text-red-400 hover:bg-red-900/50 hover:text-red-200" : "hover:bg-[#352c4d] hover:text-white"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  return (
    <div
      ref={tableRef}
      className="flex-1 flex flex-col overflow-hidden bg-[#181a1e] select-none text-[#d6d9e0] text-[13px] relative"
      onContextMenu={(e) => {
        if ((e.target as HTMLElement).tagName !== "INPUT") e.preventDefault();
      }}
    >
      {/* Location bar */}
      <div className="h-8 bg-[#1c1f24] border-b border-[#2d323b] px-3 flex items-center space-x-2 text-xs text-[#a0a7b6]">
        <button
          onClick={onUp}
          disabled={!canGoUp}
          title={t.table.up}
          className="p-1 rounded hover:bg-[#343a46] hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ArrowUp size={14} />
        </button>
        <span className="truncate font-mono text-[11px]" title={location}>
          {location}
        </span>
      </div>

      {/* Table Header */}
      <div className="h-7 bg-[#212429] border-b border-[#2d323b] grid text-[#8e95a5] text-xs font-medium px-4 items-center" style={{ gridTemplateColumns }}>
        {header("name", t.table.name)}
        {header("encrypted", t.table.encrypted)}
        {header("size", t.table.size, "right")}
        {header("packed", t.table.packed, "right")}
        {header("ratio", t.table.ratio, "right")}
        {header("mtime", t.table.modified)}
        {header("crc", t.table.crc)}
      </div>

      {/* Table Body */}
      <div className="flex-1 overflow-y-auto" onClick={(e) => e.target === e.currentTarget && onSelect([])}>
        {sorted.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-[#6e7687] text-center p-8 space-y-3">
            <PackageOpen size={36} className="opacity-40" />
            <p className="text-sm">{searchMode ? t.table.noResults : t.table.emptyFolder}</p>
          </div>
        ) : (
          sorted.map((node, index) => {
            const isSelected = selected.includes(node.path);
            const isZebra = index % 2 === 1;
            // Solid archives report the packed size of a whole block on its first file, so folder sums mean nothing.
            const packed = solid && node.isDir ? 0 : node.packed;
            return (
              <div
                key={node.path}
                onClick={(e) => handleRowClick(node, e)}
                onDoubleClick={() => onOpen(node)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (!isSelected) onSelect([node.path]);
                  setMenu({ x: Math.min(window.innerWidth - 240, e.clientX), y: Math.min(window.innerHeight - 220, e.clientY) });
                }}
                style={{ gridTemplateColumns }}
                className={`grid items-center px-4 py-1.5 border-b border-[#212429] cursor-default transition-colors ${
                  isSelected ? "bg-[#3b2a5e] text-white" : isZebra ? "bg-[#1d2025] hover:bg-[#252930]" : "bg-[#181a1e] hover:bg-[#252930]"
                }`}
              >
                <div className="flex items-center space-x-2.5 pr-2 min-w-0">
                  {iconFor(node)}
                  <div className="min-w-0">
                    <div className="truncate text-[13px]">{node.name}</div>
                    {searchMode && <div className="text-[11px] text-[#8e95a5] truncate">{node.path}</div>}
                  </div>
                </div>
                <div className="px-2">{node.encrypted && <Lock size={13} className="text-amber-400" />}</div>
                <div className="px-2 text-right font-mono text-[12px] text-[#c0c5d1] truncate">{formatSize(node.size, lang)}</div>
                <div className="px-2 text-right font-mono text-[12px] text-[#8e95a5] truncate">{packed > 0 ? formatSize(packed, lang) : "-"}</div>
                <div className="px-2 text-right font-mono text-[12px] text-[#8e95a5] truncate">
                  {node.size > 0 && packed > 0 ? `${Math.round((packed * 100) / node.size)}%` : "-"}
                </div>
                <div className="px-2 font-mono text-[12px] text-[#a0a7b6] truncate">{formatDate(node.mtime, lang)}</div>
                <div className="px-2 font-mono text-[11px] text-[#8e95a5] truncate">{node.crc}</div>
              </div>
            );
          })
        )}
      </div>

      {menu && (
        <div
          ref={menuRef}
          style={{ left: menu.x, top: menu.y }}
          className="fixed w-56 bg-[#212429] border border-[#373d47] rounded-lg shadow-xl py-1 z-50 text-xs text-[#d6d9e0]"
        >
          {menuItem(<ExternalLink size={13} />, t.contextMenu.open, "open", false, selected.length !== 1)}
          {menuItem(<FolderOutput size={13} />, t.contextMenu.extractSelected, "extractTo")}
          {menuItem(<FolderInput size={13} />, t.contextMenu.extractHere, "extractHere")}
          {menuItem(<Copy size={13} />, t.contextMenu.copyName, "copyName")}
          <div className="h-px bg-[#323843] my-1" />
          {menuItem(<Trash2 size={13} />, t.contextMenu.delete, "delete", true, !canModify)}
        </div>
      )}
    </div>
  );
};
