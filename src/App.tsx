import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  FolderOpen,
  PackagePlus,
  FolderOutput,
  ShieldCheck,
  FilePlus2,
  Trash2,
  Info,
  Settings as SettingsIcon,
  Search,
  ChevronDown,
  CloudDownload,
  HardDrive,
  Files,
  X,
  Upload,
} from "lucide-react";
import { invoke, listen, pathForFile, rendererReady } from "./bridge";
import { translations, fmt } from "./i18n";
import { AppSettings, ArchiveInfo, CompressOptions, FORMAT_CAPS, JobResult, ListResult, RarStatus } from "./types";
import { buildTree, parentPath, TreeNode } from "./tree";
import { formatSize, baseName } from "./format";
import { BrandMark } from "./components/BrandMark";
import { Sidebar } from "./components/Sidebar";
import { ArchiveTable, ContextAction } from "./components/ArchiveTable";
import { PasswordModal } from "./components/PasswordModal";
import { ChoiceModal, ChoiceRequest } from "./components/ChoiceModal";
import { ProgressModal, ProgressState } from "./components/ProgressModal";
import { CompressModal } from "./components/CompressModal";
import { InfoModal } from "./components/InfoModal";
import { RarModal } from "./components/RarModal";
import { SettingsModal } from "./components/SettingsModal";

type JobOutcome = JobResult | { error: string };

interface PathInfo {
  exists: boolean;
  isDir: boolean;
  isArchive: boolean;
  dirname: string;
  basename: string;
  folderNamedAfter: string;
}

export const App: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings>({
    language: "tr",
    default_format: "zip",
    default_level: 3,
    reveal_after_extract: true,
    rar_path: "",
    recent: [],
  });
  const [env, setEnv] = useState<{ platform: string; sevenZipFound: boolean }>({ platform: "", sevenZipFound: true });
  const lang = settings.language || "tr";
  const t = translations[lang];

  const [archive, setArchive] = useState<{ info: ArchiveInfo; password: string | null } | null>(null);
  const [currentDir, setCurrentDir] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [extractMenuOpen, setExtractMenuOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Dialog state. Each ask*() returns a promise resolved by the dialog.
  const [choice, setChoice] = useState<{ req: ChoiceRequest; resolve: (v: string | null) => void } | null>(null);
  const [pwReq, setPwReq] = useState<{ name: string; wrong: boolean; resolve: (v: string | null) => void } | null>(null);
  const [rarReq, setRarReq] = useState<{ resolve: (installed: boolean) => void; page: string } | null>(null);
  const [compressItems, setCompressItems] = useState<string[] | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [progress, setProgress] = useState<(ProgressState & { id: number }) | null>(null);
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [rarAvailable, setRarAvailable] = useState(false);

  const jobResolvers = useRef(new Map<number, (r: JobResult) => void>());
  const earlyDone = useRef(new Map<number, JobResult>());

  const ask = (req: ChoiceRequest) => new Promise<string | null>((resolve) => setChoice({ req, resolve }));
  const askPassword = (name: string, wrong: boolean) => new Promise<string | null>((resolve) => setPwReq({ name, wrong, resolve }));
  const askRar = async () => {
    const status = await invoke<RarStatus>("rar_status");
    if (status.available) return true;
    return new Promise<boolean>((resolve) => setRarReq({ resolve, page: status.downloadPage }));
  };
  const showError = (title: string, text: string, details?: string) =>
    ask({ title, text, details, tone: "error", choices: [{ label: t.result.ok, value: "ok", kind: "primary" }] });
  const showInfo = (title: string, text: string, tone: "info" | "success" = "success") =>
    ask({ title, text, tone, choices: [{ label: t.result.ok, value: "ok", kind: "primary" }] });

  const refreshSettings = () => {
    invoke<RarStatus>("rar_status").then((r) => setRarAvailable(r.available));
    return invoke<AppSettings>("get_settings").then(setSettings);
  };

  useEffect(() => {
    refreshSettings();
    invoke("get_environment").then(setEnv);
  }, []);

  useEffect(() => {
    document.title = archive ? `${archive.info.name} - ${t.appTitle}` : t.appTitle;
  }, [archive, t]);

  const dragOutNodes = async (nodes: TreeNode[]) => {
    if (!archive || !nodes.length) return;
    let pw = await passwordFor(nodes.map((n) => n.path));
    if (pw === false) return;
    for (;;) {
      const r = await invoke<{ status: string; summary?: string; output?: string }>("drag_out", { path: archive.info.path, entries: nodes.map((n) => n.path), password: pw });
      if (r.status === "password") {
        const p = await askPassword(archive.info.name, true);
        if (p === null) return;
        pw = p;
        continue;
      }
      if (r.status === "ok") rememberPassword(pw);
      else await showError(t.result.openEntryFailed, r.summary || "", r.output);
      return;
    }
  };

  // ---------------------------------------------------------------------------
  // Jobs

  const progressTitle = (key: string) => (t.progress as Record<string, string>)[key] || key;

  useEffect(() => {
    const offProgress = listen<{ id: number; file?: string; percent?: number; step: number; steps: number; title: string }>("job_progress", (e) => {
      setProgress((p) => {
        if (!p || p.id !== e.id) return p;
        const files = e.file && e.file !== p.files[p.files.length - 1] ? [...p.files, e.file] : p.files;
        return {
          ...p,
          title: progressTitle(e.title),
          step: e.step,
          steps: e.steps,
          percent: e.percent ?? (e.step !== p.step ? null : p.percent),
          file: e.file ?? p.file,
          files: files.length > 2000 ? files.slice(-1000) : files,
        };
      });
    });
    const offDone = listen<{ id: number; result: JobResult }>("job_done", (e) => {
      const resolve = jobResolvers.current.get(e.id);
      if (resolve) {
        jobResolvers.current.delete(e.id);
        resolve(e.result);
      } else {
        earlyDone.current.set(e.id, e.result);
      }
      setProgress((p) => (p && p.id === e.id ? null : p));
    });
    const offUpdate = listen<{ version: string }>("update_downloaded", (e) => setUpdateVersion(e?.version || "?"));
    return () => {
      offProgress();
      offDone();
      offUpdate();
    };
  }, [lang]);

  const runJob = async (cmd: string, args: Record<string, unknown>, titleKey: string, subject: string): Promise<JobOutcome> => {
    const res = await invoke<{ id?: number; error?: string }>(cmd, args);
    if (res.error || res.id === undefined) return { error: res.error || "unknown" };
    const id = res.id;
    const early = earlyDone.current.get(id);
    if (early) {
      earlyDone.current.delete(id);
      return early;
    }
    setProgress({ id, title: progressTitle(titleKey), subject, percent: null, file: "", files: [], step: 0, steps: 1, startedAt: Date.now() });
    return new Promise((resolve) => jobResolvers.current.set(id, resolve));
  };

  const cancelJob = () => progress && invoke("cancel_job", { id: progress.id });

  // ---------------------------------------------------------------------------
  // Open / reload

  const openArchive = async (path: string, opts: { keepDir?: boolean; password?: string | null } = {}) => {
    if (!env.sevenZipFound) {
      await showError(t.result.openFailed, t.result.engineMissing);
      return false;
    }
    let pw = opts.password ?? null;
    for (;;) {
      const res = await invoke<ListResult>("list_archive", { path, password: pw });
      if (res.status === "ok") {
        setArchive({ info: res.info, password: pw });
        if (!opts.keepDir) {
          setCurrentDir("");
          setSearch("");
        }
        setSelected([]);
        refreshSettings();
        return true;
      }
      if (res.status === "password") {
        const p = await askPassword(baseName(path), res.wrong);
        if (p === null) return false;
        pw = p;
        continue;
      }
      await showError(
        t.result.openFailed,
        res.summary === "not_found" ? t.result.notFound : res.notArchive ? fmt(t.result.notArchive, { name: baseName(path) }) : res.summary,
        res.output || undefined
      );
      return false;
    }
  };

  const reload = async () => {
    if (!archive) return;
    const ok = await openArchive(archive.info.path, { keepDir: true, password: archive.password });
    if (!ok) closeArchive();
  };

  const closeArchive = () => {
    if (archive) invoke("close_archive", { path: archive.info.path });
    setArchive(null);
    setCurrentDir("");
    setSelected([]);
    setSearch("");
  };

  const openDialog = async () => {
    const p = await invoke<string | null>("open_archive_dialog");
    if (p) openArchive(p);
  };

  // ---------------------------------------------------------------------------
  // Tree / rows

  const tree = useMemo(() => (archive ? buildTree(archive.info.entries) : null), [archive?.info]);

  useEffect(() => {
    if (tree && !tree.byPath.has(currentDir)) setCurrentDir("");
  }, [tree]);

  const rows: TreeNode[] = useMemo(() => {
    if (!tree) return [];
    const q = search.trim().toLocaleLowerCase(lang);
    if (q) return [...tree.byPath.values()].filter((n) => n.path && n.name.toLocaleLowerCase(lang).includes(q));
    return tree.byPath.get(currentDir)?.children || [];
  }, [tree, currentDir, search, lang]);

  const nodesFor = (paths: string[]) => paths.map((p) => tree?.byPath.get(p.replace(/^(\.\/)+/, ""))).filter(Boolean) as TreeNode[];

  const fileCount = archive ? archive.info.entries.filter((e) => !e.isDir).length : 0;
  const folderCount = tree ? tree.byPath.size - 1 - fileCount : 0;
  const totalSize = tree ? tree.root.size : 0;

  // ---------------------------------------------------------------------------
  // Password helper: asks when the chosen items (or the headers) are encrypted and no password is known yet.

  const passwordFor = async (names: string[] | null): Promise<string | null | false> => {
    if (!archive) return false;
    const { info, password } = archive;
    if (password) return password;
    const encrypted = info.headersEncrypted || (names ? nodesFor(names).some((n) => n.encrypted) : info.hasEncrypted);
    if (!encrypted) return null;
    const p = await askPassword(info.name, false);
    return p === null ? false : p;
  };

  const rememberPassword = (pw: string | null) => {
    if (pw) setArchive((a) => (a ? { ...a, password: pw } : a));
  };

  // ---------------------------------------------------------------------------
  // Extract / test

  const extract = async (mode: "here" | "folder" | "to", names: string[] | null) => {
    setExtractMenuOpen(false);
    if (!archive) return;
    const info = archive.info;
    if (info.hasUnsafePaths) {
      await showError(t.result.extractRefused, t.result.unsafePaths);
      return;
    }
    const pi = await invoke<PathInfo>("path_info", { path: info.path });
    let dest = mode === "here" ? pi.dirname : pi.folderNamedAfter;
    if (mode === "to") {
      const chosen = await invoke<string | null>("choose_folder", { defaultPath: pi.dirname });
      if (!chosen) return;
      dest = chosen;
    }
    let pw = await passwordFor(names);
    if (pw === false) return;

    const existing = await invoke<string[]>("check_conflicts", { path: info.path, names, dest });
    let owMode = "rename";
    if (existing.length) {
      const o = t.overwrite;
      const c = await ask({
        title: o.title,
        text: fmt(o.text, { count: existing.length }),
        items: existing,
        tone: "question",
        cancelValue: "cancel",
        choices: [
          { label: o.cancel, value: "cancel" },
          { label: o.skip, value: "skip" },
          { label: o.overwrite, value: "overwrite" },
          { label: o.rename, value: "rename", kind: "primary" },
        ],
      });
      if (!c || c === "cancel") return;
      owMode = c;
    }

    for (;;) {
      const r = await runJob("start_extract", { path: info.path, names, dest, password: pw, mode: owMode }, "extract", info.name);
      if ("error" in r) {
        await showError(t.result.extractRefused, r.error === "unsafe_paths" ? t.result.unsafePaths : r.error);
        return;
      }
      if (r.cancelled) return;
      if (r.wrongPassword) {
        const p = await askPassword(info.name, true);
        if (p === null) return;
        pw = p;
        continue;
      }
      if (!r.ok) {
        await showError(t.result.extractFailed, r.summary, r.output);
        return;
      }
      rememberPassword(pw);
      if (r.code === 1) await showInfo(t.result.extractWarnings, r.summary, "info");
      if (settings.reveal_after_extract) {
        if (mode === "folder") invoke("reveal", { path: dest });
        else invoke("open_path", { path: dest });
      }
      return;
    }
  };

  const testArchive = async () => {
    if (!archive) return;
    const info = archive.info;
    let pw = await passwordFor(null);
    if (pw === false) return;
    for (;;) {
      const r = await runJob("start_test", { path: info.path, password: pw }, "test", info.name);
      if ("error" in r || r.cancelled) return;
      if (r.wrongPassword) {
        const p = await askPassword(info.name, true);
        if (p === null) return;
        pw = p;
        continue;
      }
      if (r.ok) {
        rememberPassword(pw);
        await showInfo(t.result.testOk, fmt(t.result.testOkText, { name: info.name }));
      } else {
        await showError(t.result.testFailed, r.summary, r.output);
      }
      return;
    }
  };

  const openNode = async (node: TreeNode) => {
    if (node.isDir) {
      setSearch("");
      setCurrentDir(node.path.replace(/^(\.\/)+/, ""));
      setSelected([]);
      return;
    }
    if (!archive) return;
    let pw = await passwordFor([node.path]);
    if (pw === false) return;
    for (;;) {
      const r = await invoke<{ status: string; summary?: string; output?: string }>("open_entry", { path: archive.info.path, entry: node.path, password: pw });
      if (r.status === "password") {
        const p = await askPassword(archive.info.name, true);
        if (p === null) return;
        pw = p;
        continue;
      }
      if (r.status === "ok") rememberPassword(pw);
      else await showError(t.result.openEntryFailed, r.summary || "", r.output);
      return;
    }
  };

  // ---------------------------------------------------------------------------
  // Modify

  const notSupported = () => showError(t.result.notSupported, t.result.notSupportedText);

  const modify = async (cmd: "start_add" | "start_delete", payload: Record<string, unknown>, titleKey: string, failTitle: string) => {
    if (!archive) return;
    const info = archive.info;
    if (!info.supportsModification) return notSupported();
    if (info.isRar && !(await askRar())) return;
    let pw: string | null = archive.password;
    if (!pw && (cmd === "start_add" ? info.hasEncrypted : info.headersEncrypted)) {
      pw = await askPassword(info.name, false);
      if (pw === null) return;
    }
    for (;;) {
      const r = await runJob(cmd, { path: info.path, password: pw, ...payload }, titleKey, info.name);
      if ("error" in r) {
        if (r.error === "rar_missing" && (await askRar())) continue;
        if (r.error === "not_supported") await notSupported();
        return;
      }
      if (r.cancelled) break;
      if (r.wrongPassword) {
        const p = await askPassword(info.name, true);
        if (p === null) break;
        pw = p;
        continue;
      }
      if (!r.ok) await showError(failTitle, r.summary, r.output);
      break;
    }
    await openArchive(info.path, { keepDir: true, password: pw });
  };

  const addItems = async (items?: string[]) => {
    if (!archive) return;
    if (!archive.info.supportsModification) return notSupported();
    const list = items || (await invoke<string[]>("choose_items", { folders: false }));
    if (!list.length) return;
    await modify("start_add", { items: list }, "add", t.result.addFailed);
  };

  const deleteItems = async (names: string[]) => {
    if (!archive || !names.length) return;
    if (!archive.info.supportsModification) return notSupported();
    const c = await ask({
      title: t.toolbar.delete,
      text: fmt(t.result.deleteConfirm, { count: names.length }),
      items: names,
      tone: "question",
      choices: [
        { label: t.result.cancel, value: "cancel" },
        { label: t.result.yes, value: "yes", kind: "danger" },
      ],
    });
    if (c !== "yes") return;
    await modify("start_delete", { names }, "delete", t.result.deleteFailed);
    setSelected([]);
  };

  // ---------------------------------------------------------------------------
  // Compress

  const compress = async (items: string[], options: CompressOptions) => {
    setCompressItems(null);
    const o = { ...options };
    if (o.format === "rar" && !(await askRar())) return;
    const pi = await invoke<PathInfo>("path_info", { path: o.archivePath });
    if (pi.exists) {
      const e = t.existing;
      const canAppend = FORMAT_CAPS[o.format].append && !pi.isDir;
      const c = await ask({
        title: fmt(e.title, { name: pi.basename }),
        text: canAppend ? e.appendText : e.newText,
        tone: "question",
        choices: [
          { label: e.cancel, value: "cancel" },
          ...(canAppend ? [{ label: e.append, value: "append" }] : []),
          { label: e.newArchive, value: "new", kind: "primary" as const },
        ],
      });
      if (c === "new") o.archivePath = await invoke<string>("unique_path", { path: o.archivePath });
      else if (c !== "append") return;
    }
    for (;;) {
      const r = await runJob("start_compress", { items, options: o }, "compress", baseName(o.archivePath));
      if ("error" in r) {
        if (r.error === "rar_missing" && (await askRar())) continue;
        return;
      }
      if (r.cancelled) return;
      if (!r.ok) {
        await showError(t.result.compressFailed, r.summary, r.output);
        return;
      }
      break;
    }
    const firstPart = o.volumeSize ? `${o.archivePath}${o.format === "rar" ? "" : ".001"}` : o.archivePath;
    const target = o.format === "rar" && o.volumeSize ? o.archivePath.replace(/\.rar$/i, ".part1.rar") : firstPart;
    const c = await ask({
      title: t.result.compressDone,
      text: target,
      tone: "success",
      choices: [
        { label: t.result.ok, value: "ok" },
        { label: t.result.reveal, value: "reveal" },
        { label: t.result.open, value: "open", kind: "primary" },
      ],
    });
    if (c === "reveal") invoke("reveal", { path: target });
    if (c === "open") openArchive(target);
  };

  // ---------------------------------------------------------------------------
  // Drag & drop, files from the OS

  const handleIncoming = async (paths: string[], fromOs = false) => {
    if (!paths.length) return;
    const infos = await Promise.all(paths.map((p) => invoke<PathInfo>("path_info", { path: p })));
    const singleArchive = paths.length === 1 && infos[0].isArchive && !infos[0].isDir;
    if (singleArchive && (!archive || fromOs)) {
      openArchive(paths[0]);
      return;
    }
    if (!archive) {
      setCompressItems(paths);
      return;
    }
    const d = t.drop;
    const c = await ask({
      title: t.appTitle,
      text: fmt(d.question, { count: paths.length }),
      items: paths.map(baseName),
      tone: "question",
      choices: [
        ...(singleArchive ? [{ label: d.openArchive, value: "open" }] : []),
        { label: d.newArchive, value: "new" },
        ...(archive.info.supportsModification ? [{ label: d.addHere, value: "add", kind: "primary" as const }] : []),
      ],
    });
    if (c === "open") openArchive(paths[0]);
    else if (c === "new") setCompressItems(paths);
    else if (c === "add") addItems(paths);
  };

  const incomingRef = useRef(handleIncoming);
  incomingRef.current = handleIncoming;

  useEffect(() => {
    const off = listen<string[]>("open_paths", (paths) => incomingRef.current(paths, true));
    rendererReady();
    return off;
  }, []);

  const busy = Boolean(progress || choice || pwReq || rarReq || compressItems || infoOpen || settingsOpen);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (busy && !compressItems) return;
    const paths = Array.from(e.dataTransfer.files).map(pathForFile).filter(Boolean);
    if (compressItems) setCompressItems([...compressItems, ...paths.filter((p) => !compressItems.includes(p))]);
    else handleIncoming(paths);
  };

  // ---------------------------------------------------------------------------
  // Keyboard

  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e: KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;
    const inInput = (e.target as HTMLElement)?.tagName === "INPUT";
    if (busy) return;
    if (mod && e.key.toLowerCase() === "o") {
      e.preventDefault();
      openDialog();
    } else if (mod && e.key.toLowerCase() === "n") {
      e.preventDefault();
      setCompressItems([]);
    } else if (mod && e.key.toLowerCase() === "f") {
      e.preventDefault();
      searchRef.current?.focus();
    } else if (inInput) {
      if (e.key === "Escape") {
        setSearch("");
        (e.target as HTMLElement).blur();
      }
    } else if (!archive) {
      return;
    } else if (mod && e.key.toLowerCase() === "a") {
      e.preventDefault();
      setSelected(rows.map((r) => r.path));
    } else if (mod && e.key.toLowerCase() === "e") {
      e.preventDefault();
      extract(e.shiftKey ? "to" : e.altKey ? "folder" : "here", selected.length ? selected : null);
    } else if (mod && e.key.toLowerCase() === "i") {
      e.preventDefault();
      setInfoOpen(true);
    } else if (e.key === "Enter" && selected.length === 1) {
      const n = nodesFor(selected)[0];
      if (n) openNode(n);
    } else if (e.key === "Backspace" && !search && currentDir) {
      setCurrentDir(parentPath(currentDir));
      setSelected([]);
    } else if ((e.key === "Delete" || (e.key === "Backspace" && e.metaKey)) && selected.length) {
      deleteItems(selected);
    }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const onContext = (action: ContextAction, nodes: TreeNode[]) => {
    const names = nodes.map((n) => n.path);
    switch (action) {
      case "open":
        if (nodes[0]) openNode(nodes[0]);
        break;
      case "extractTo":
        extract("to", names);
        break;
      case "extractHere":
        extract("here", names);
        break;
      case "delete":
        deleteItems(names);
        break;
      case "copyName":
        navigator.clipboard.writeText(nodes.map((n) => n.name).join("\n"));
        break;
    }
  };

  // ---------------------------------------------------------------------------
  // Render

  const toolButton = (icon: React.ReactNode, title: string, onClick: () => void, disabled = false) => (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="p-1.5 text-[#cfd3dc] hover:text-white hover:bg-[#383f4b] rounded transition-colors disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-[#cfd3dc]"
    >
      {icon}
    </button>
  );

  const noArchive = !archive;
  const location = search.trim()
    ? `${t.table.searchResults}: "${search.trim()}"`
    : archive
    ? `${archive.info.name}${currentDir ? "/" + currentDir : ""}`
    : "";

  return (
    <div
      className="flex h-screen bg-[#181a1e] text-[#d6d9e0] flex-col overflow-hidden font-sans select-none relative"
      onDragOver={(e) => {
        e.preventDefault();
        if (!busy || compressItems) setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={onDrop}
    >
      {/* Top toolbar, same layout as the download manager */}
      <header className="h-12 bg-[#212429] border-b border-[#16181b] px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-2.5 min-w-0 w-56">
          <BrandMark />
          <h1 className="text-sm font-semibold tracking-wide text-white truncate">{t.appTitle}</h1>
        </div>

        <div className="flex items-center space-x-1.5 bg-[#2b3038] p-1 rounded-lg border border-[#373d47]">
          {toolButton(<FolderOpen size={16} />, `${t.toolbar.open} (Ctrl/⌘+O)`, openDialog)}
          {toolButton(<PackagePlus size={16} />, `${t.toolbar.compress} (Ctrl/⌘+N)`, () => setCompressItems([]))}

          <div className="w-px h-4 bg-[#3d4452] mx-1" />

          {/* Extract split button */}
          <div className="relative">
            <div className="flex items-center">
              <button
                onClick={() => extract("folder", null)}
                title={t.toolbar.extractFolder}
                disabled={noArchive}
                className="p-1.5 text-[#cfd3dc] hover:text-white hover:bg-[#383f4b] rounded-l transition-colors disabled:opacity-35 disabled:hover:bg-transparent"
              >
                <FolderOutput size={16} />
              </button>
              <button
                onClick={() => setExtractMenuOpen(!extractMenuOpen)}
                title={t.toolbar.extract}
                disabled={noArchive}
                className="p-1 text-[#8e95a5] hover:text-white hover:bg-[#383f4b] rounded-r border-l border-[#373d47] transition-colors disabled:opacity-35 disabled:hover:bg-transparent"
              >
                <ChevronDown size={11} />
              </button>
            </div>
            {extractMenuOpen && archive && (
              <div
                className="absolute left-0 top-full mt-1.5 w-64 bg-[#212429] border border-[#373d47] rounded-lg shadow-xl py-1 z-50 text-xs text-[#d6d9e0]"
                onMouseLeave={() => setExtractMenuOpen(false)}
              >
                {[
                  [t.toolbar.extractHere, () => extract("here", null), "Ctrl/⌘+E"],
                  [t.toolbar.extractFolder, () => extract("folder", null), "⌥/Alt+E"],
                  [t.toolbar.extractTo, () => extract("to", null), "⇧+E"],
                ].map(([label, fn, key]) => (
                  <button
                    key={label as string}
                    onClick={fn as () => void}
                    className="w-full text-left px-3 py-1.5 hover:bg-[#352c4d] hover:text-white flex items-center justify-between"
                  >
                    <span>{label as string}</span>
                    <span className="text-[10px] text-[#8e95a5] font-mono">{key as string}</span>
                  </button>
                ))}
                <div className="h-px bg-[#323843] my-1" />
                <button
                  disabled={!selected.length}
                  onClick={() => extract("to", selected)}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#352c4d] hover:text-white flex items-center justify-between disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <span>{t.toolbar.extractSelected}</span>
                  <span className="text-[11px] text-[#8e95a5] font-mono">{selected.length}</span>
                </button>
              </div>
            )}
          </div>

          {toolButton(<ShieldCheck size={15} />, t.toolbar.test, testArchive, noArchive)}

          <div className="w-px h-4 bg-[#3d4452] mx-1" />

          {toolButton(<FilePlus2 size={15} />, t.toolbar.add, () => addItems(), noArchive)}
          {toolButton(<Trash2 size={15} />, t.toolbar.delete, () => deleteItems(selected), noArchive || !selected.length)}
          {toolButton(<Info size={15} />, `${t.toolbar.info} (Ctrl/⌘+I)`, () => setInfoOpen(true), noArchive)}

          <div className="w-px h-4 bg-[#3d4452] mx-1" />

          {toolButton(<SettingsIcon size={15} />, t.toolbar.settings, () => setSettingsOpen(true))}
        </div>

        <div className="flex items-center space-x-2 w-56 justify-end">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-2.5 top-2 text-[#8e95a5]" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              disabled={noArchive}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.toolbar.searchPrompt}
              className="w-full bg-[#181a1e] border border-[#343a46] rounded-md pl-8 pr-3 py-1 text-xs text-[#cfd3dc] placeholder-[#6f7787] focus:outline-none focus:border-violet-500 transition-colors disabled:opacity-50"
            />
          </div>
          {archive && (
            <button onClick={closeArchive} title={t.toolbar.close} className="p-1 text-[#8e95a5] hover:text-white rounded hover:bg-[#343a46]">
              <X size={14} />
            </button>
          )}
        </div>
      </header>

      {/* Main split view: folder tree + archive contents */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          t={t}
          root={tree?.root || null}
          archiveName={archive?.info.name || ""}
          currentDir={search ? "\0" : currentDir}
          onSelectDir={(p) => {
            setSearch("");
            setCurrentDir(p);
            setSelected([]);
          }}
          recent={settings.recent || []}
          activeArchive={archive?.info.path || null}
          onOpenRecent={(p) => openArchive(p)}
          onClearRecent={() => {
            setSettings((s) => ({ ...s, recent: [] }));
            invoke("save_settings", { newSettings: { recent: [] } });
          }}
        />
        <main className="flex-1 flex flex-col overflow-hidden">
          {archive ? (
            <ArchiveTable
              t={t}
              lang={lang}
              rows={rows}
              searchMode={Boolean(search.trim())}
              location={location}
              canGoUp={!search && currentDir !== ""}
              onUp={() => {
                setCurrentDir(parentPath(currentDir));
                setSelected([]);
              }}
              selected={selected}
              onSelect={setSelected}
              onOpen={openNode}
              onDragOut={dragOutNodes}
              onContext={onContext}
              canModify={archive.info.supportsModification}
              solid={archive.info.solid}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-4 text-[#8e95a5]">
              <BrandMark className="w-16 h-16 rounded-2xl opacity-90" />
              <h2 className="text-lg text-white font-semibold">{t.empty.title}</h2>
              <p className="whitespace-pre-line text-sm max-w-md leading-relaxed">{t.empty.text}</p>
              <div className="flex items-center space-x-2 pt-1">
                <button
                  onClick={openDialog}
                  className="flex items-center space-x-1.5 px-3.5 py-1.5 text-xs bg-violet-600 hover:bg-violet-500 text-white rounded font-medium shadow-sm transition-colors"
                >
                  <FolderOpen size={14} />
                  <span>{t.empty.openButton}</span>
                </button>
                <button
                  onClick={() => setCompressItems([])}
                  className="flex items-center space-x-1.5 px-3.5 py-1.5 text-xs bg-[#2d323b] hover:bg-[#383e4a] text-[#cfd3dc] rounded border border-[#3b424e] transition-colors"
                >
                  <PackagePlus size={14} />
                  <span>{t.empty.compressButton}</span>
                </button>
              </div>
              <p className="text-[11px] text-[#6e7687] max-w-md">{t.empty.formats}</p>
            </div>
          )}
        </main>
      </div>

      {/* Bottom status bar */}
      <footer className="h-7 bg-[#1c1f24] border-t border-[#16181b] px-4 flex items-center justify-between text-xs text-[#8e95a5] shrink-0">
        <div className="flex items-center space-x-2.5 min-w-0">
          <span className="text-[11px] font-mono text-[#8e95a5] select-all">v.{__APP_VERSION__}</span>
          <div
            className={`w-2 h-2 rounded-full shadow-sm ${env.sevenZipFound ? "bg-emerald-500 shadow-emerald-500/50" : "bg-amber-500 shadow-amber-500/50"}`}
          />
          <span className="text-[12px] text-[#a0a7b6]">{env.sevenZipFound ? t.statusBar.engineReady : t.statusBar.engineMissing}</span>
          {archive && (
            <span className="text-[12px] text-[#a0a7b6] truncate">
              · {archive.info.type}
              {archive.info.solid ? ", solid" : ""}
              {archive.info.hasEncrypted ? " · 🔒" : ""}
            </span>
          )}
        </div>
        {archive && (
          <div className="flex items-center space-x-4 text-[12px] text-[#a0a7b6] font-mono">
            {selected.length > 0 && <span className="text-[#a78bfa]">{fmt(t.statusBar.selected, { count: selected.length })}</span>}
            <div className="flex items-center space-x-1.5">
              <Files size={14} className="text-[#8e95a5]" />
              <span>
                {fmt(t.statusBar.files, { count: fileCount })}, {fmt(t.statusBar.folders, { count: folderCount })}
              </span>
            </div>
            <div className="flex items-center space-x-1.5">
              <HardDrive size={14} className="text-[#8e95a5]" />
              <span>
                {formatSize(totalSize, lang)} → {formatSize(archive.info.archiveSize, lang)}
              </span>
            </div>
          </div>
        )}
      </footer>

      {/* Drop overlay */}
      {dragging && (
        <div className="absolute inset-2 z-40 rounded-xl border-2 border-dashed border-violet-500/70 bg-violet-950/30 flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center space-y-2 text-violet-300">
            <Upload size={32} />
            <span className="text-sm font-medium">{t.drop.hint}</span>
          </div>
        </div>
      )}

      {/* Modals */}
      {compressItems && (
        <CompressModal
          t={t}
          initialItems={compressItems}
          key={compressItems.join("|")}
          defaultFormat={settings.default_format}
          defaultLevel={settings.default_level}
          rarAvailable={rarAvailable}
          onCancel={() => setCompressItems(null)}
          onSubmit={compress}
        />
      )}
      {infoOpen && archive && <InfoModal t={t} lang={lang} info={archive.info} onClose={() => setInfoOpen(false)} />}
      {settingsOpen && (
        <SettingsModal
          lang={lang}
          settings={settings}
          onClose={() => {
            setSettingsOpen(false);
            refreshSettings();
          }}
          onSave={async (s) => {
            setSettings(await invoke<AppSettings>("save_settings", { newSettings: s }));
          }}
        />
      )}
      {progress && <ProgressModal t={t} state={progress} onCancel={cancelJob} />}
      {rarReq && (
        <RarModal
          t={t}
          platform={env.platform}
          downloadPage={rarReq.page}
          onClose={(installed) => {
            rarReq.resolve(installed);
            setRarReq(null);
            refreshSettings();
          }}
        />
      )}
      {pwReq && (
        <PasswordModal
          t={t}
          archiveName={pwReq.name}
          wrong={pwReq.wrong}
          onSubmit={(v) => {
            pwReq.resolve(v);
            setPwReq(null);
          }}
        />
      )}
      {choice && (
        <ChoiceModal
          t={t}
          req={choice.req}
          onChoose={(v) => {
            choice.resolve(v);
            setChoice(null);
          }}
        />
      )}

      {/* Auto update notification toast */}
      {updateVersion && (
        <div className="fixed bottom-10 right-4 z-50 bg-[#1e232d] border border-violet-500/60 shadow-2xl rounded-lg p-3.5 max-w-sm flex items-start space-x-3 backdrop-blur-md">
          <div className="w-8 h-8 rounded-full bg-violet-500/20 text-violet-400 flex items-center justify-center shrink-0 mt-0.5">
            <CloudDownload size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-semibold text-white">{t.update.ready}</h4>
            <p className="text-[11px] text-[#a0a7b6] mt-0.5 leading-relaxed">{fmt(t.update.text, { version: updateVersion })}</p>
            <div className="mt-2.5 flex items-center space-x-2">
              <button
                onClick={() => invoke("restart_and_update")}
                className="px-2.5 py-1 text-xs bg-violet-600 hover:bg-violet-500 text-white rounded font-medium shadow-sm transition-colors"
              >
                {t.update.restart}
              </button>
              <button onClick={() => setUpdateVersion(null)} className="px-2 py-1 text-xs text-[#8e95a5] hover:text-white transition-colors">
                {t.update.later}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
