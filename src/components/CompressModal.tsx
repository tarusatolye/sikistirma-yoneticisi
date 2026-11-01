import React, { useEffect, useRef, useState } from "react";
import { PackagePlus, FilePlus2, FolderPlus, X, Folder, File, Eye, EyeOff } from "lucide-react";
import { Modal, Button, Checkbox, inputClass } from "./Modal";
import { Combobox } from "./Combobox";
import { invoke } from "../bridge";
import { T } from "../i18n";
import { ArchiveFormat, CompressOptions, FORMAT_CAPS, FORMAT_ORDER } from "../types";
import { baseName } from "../format";

interface CompressModalProps {
  t: T;
  initialItems: string[];
  defaultFormat: ArchiveFormat;
  defaultLevel: number;
  rarAvailable: boolean;
  onCancel: () => void;
  onSubmit: (items: string[], options: CompressOptions) => void;
}

const VOLUME_PRESETS = ["", "100m", "700m", "1g", "4092m", "custom"];

export const CompressModal: React.FC<CompressModalProps> = ({ t, initialItems, defaultFormat, defaultLevel, rarAvailable, onCancel, onSubmit }) => {
  const c = t.compress;
  const [items, setItems] = useState<string[]>(initialItems);
  const [format, setFormat] = useState<ArchiveFormat>(defaultFormat);
  const [level, setLevel] = useState(defaultLevel);
  const [archivePath, setArchivePath] = useState("");
  const pathEdited = useRef(false);
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [encryptNames, setEncryptNames] = useState(false);
  const [solid, setSolid] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [deleteAfter, setDeleteAfter] = useState(false);
  const [volumePreset, setVolumePreset] = useState("");
  const [volumeCustom, setVolumeCustom] = useState("");
  const caps = FORMAT_CAPS[format];

  // Archive name follows the items until the user types or browses a name of their own.
  useEffect(() => {
    if (pathEdited.current || items.length === 0) return;
    invoke<string>("default_archive_path", { items, format }).then(setArchivePath);
  }, [items]);

  const changeFormat = async (f: ArchiveFormat) => {
    setFormat(f);
    if (archivePath) setArchivePath(await invoke<string>("replace_format_ext", { path: archivePath, format: f }));
  };

  const addItems = async (folders: boolean) => {
    const picked = await invoke<string[]>("choose_items", { folders });
    if (picked.length) setItems((prev) => [...prev, ...picked.filter((p) => !prev.includes(p))]);
  };

  const browse = async () => {
    const p = await invoke<string | null>("choose_save_path", { defaultPath: archivePath });
    if (p) {
      pathEdited.current = true;
      setArchivePath(await invoke<string>("replace_format_ext", { path: p, format }));
    }
  };

  const volumeSize = caps.volumes ? (volumePreset === "custom" ? volumeCustom.trim() : volumePreset) : "";
  const volumeValid = !volumeSize || /^\d+(\.\d+)?[bkmg]?$/i.test(volumeSize);
  const pwMismatch = caps.password && password !== password2;
  const canSubmit = items.length > 0 && archivePath.trim() && !pwMismatch && volumeValid;

  const hint =
    format === "rar"
      ? rarAvailable
        ? c.hints.rar
        : c.hints.rarMissing
      : format.startsWith("tar.")
      ? c.hints.targz
      : c.hints[format as "zip" | "7z" | "tar"];

  const formatLabel = (f: ArchiveFormat) =>
    f === "rar" ? (rarAvailable ? "RAR 5" : c.rarNeedsTool) : f === "tar" ? c.tarPlain : f === "7z" ? "7z" : f.toUpperCase();

  const submit = () => {
    if (!canSubmit) return;
    onSubmit(items, {
      archivePath: archivePath.trim(),
      format,
      level,
      password: caps.password ? password : "",
      encryptNames: caps.encryptNames && !!password && encryptNames,
      solid: caps.solid && solid,
      volumeSize,
      recovery: !!caps.recovery && recovery,
      deleteAfter,
    });
  };

  return (
    <Modal
      title={c.title}
      icon={<PackagePlus size={14} />}
      onClose={onCancel}
      width="max-w-2xl"
      footer={
        <>
          <Button onClick={onCancel}>{c.cancel}</Button>
          <Button kind="primary" disabled={!canSubmit} onClick={submit}>
            {c.create}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Items */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-[#8e95a5] font-medium">
              {c.items} ({items.length})
            </label>
            <div className="flex items-center space-x-1.5">
              <button
                type="button"
                onClick={() => addItems(false)}
                className="flex items-center space-x-1 text-[11px] px-2 py-0.5 rounded bg-[#2a2f3a] hover:bg-[#353c4a] text-violet-400 border border-[#3b4352]"
              >
                <FilePlus2 size={11} />
                <span>{c.addFiles}</span>
              </button>
              <button
                type="button"
                onClick={() => addItems(true)}
                className="flex items-center space-x-1 text-[11px] px-2 py-0.5 rounded bg-[#2a2f3a] hover:bg-[#353c4a] text-violet-400 border border-[#3b4352]"
              >
                <FolderPlus size={11} />
                <span>{c.addFolder}</span>
              </button>
            </div>
          </div>
          <ul className="h-24 overflow-y-auto bg-[#181a1e] border border-[#343a46] rounded-md py-1">
            {items.length === 0 ? (
              <li className="px-3 py-2 text-[11px] text-[#6e7687]">{c.noItems}</li>
            ) : (
              items.map((it) => (
                <li key={it} className="group flex items-center justify-between px-3 py-0.5 hover:bg-[#252930]" title={it}>
                  <div className="flex items-center space-x-2 min-w-0">
                    {/\.[^\\/]+$/.test(baseName(it)) ? (
                      <File size={12} className="text-[#8e95a5] shrink-0" />
                    ) : (
                      <Folder size={12} className="text-[#8e95a5] shrink-0" />
                    )}
                    <span className="truncate text-[#c0c5d1]">{it}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setItems((prev) => prev.filter((p) => p !== it))}
                    className="tarus-satir-islem p-0.5 text-[#8e95a5] hover:text-red-400"
                  >
                    <X size={12} />
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>

        {/* Archive path */}
        <div className="space-y-1">
          <label className="text-[#8e95a5] font-medium">{c.archivePath}</label>
          <div className="flex space-x-2">
            <input
              type="text"
              value={archivePath}
              onChange={(e) => {
                pathEdited.current = true;
                setArchivePath(e.target.value);
              }}
              className={`${inputClass} font-mono`}
            />
            <Button onClick={browse} className="shrink-0">
              {c.browse}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-[#8e95a5] font-medium">{c.format}</label>
            <Combobox
              ariaLabel={c.format}
              value={format}
              onChange={changeFormat}
              options={FORMAT_ORDER.map((f) => ({ value: f, label: formatLabel(f) }))}
            />
          </div>
          <div className={`space-y-1 ${caps.level ? "" : "opacity-40 pointer-events-none"}`}>
            <label className="text-[#8e95a5] font-medium">{c.level}</label>
            <Combobox ariaLabel={c.level} value={level} onChange={setLevel} options={c.levels.map((l, i) => ({ value: i, label: l }))} />
          </div>
        </div>
        <p className="text-[11px] text-[#8e95a5] -mt-2">{hint}</p>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className={`space-y-1 ${caps.password ? "" : "opacity-40"}`}>
              <label className="text-[#8e95a5] font-medium">{c.password}</label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  disabled={!caps.password}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${inputClass} pr-9 font-mono`}
                />
                <button
                  type="button"
                  disabled={!caps.password}
                  onClick={() => setShowPw((s) => !s)}
                  className="absolute right-2 top-1.5 text-[#8e95a5] hover:text-white"
                >
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <input
                type={showPw ? "text" : "password"}
                disabled={!caps.password}
                value={password2}
                placeholder={c.passwordRepeat}
                onChange={(e) => setPassword2(e.target.value)}
                className={`${inputClass} font-mono ${pwMismatch && password2 ? "border-red-500" : ""}`}
              />
              {pwMismatch && password2 && <p className="text-[11px] text-red-400">{c.passwordMismatch}</p>}
            </div>
            <Checkbox checked={encryptNames} disabled={!caps.encryptNames || !password} onChange={setEncryptNames} label={c.encryptNames} />
          </div>

          <div className="space-y-2">
            <div className={`space-y-1 ${caps.volumes ? "" : "opacity-40 pointer-events-none"}`}>
              <label className="text-[#8e95a5] font-medium">{c.volume}</label>
              <Combobox
                ariaLabel={c.volume}
                value={volumePreset}
                onChange={setVolumePreset}
                options={VOLUME_PRESETS.map((v) => ({
                  value: v,
                  label: v === "" ? c.volumeNone : v === "custom" ? c.volumeCustom : v.toUpperCase().replace(/([MG])$/, " $1B"),
                }))}
              />
              {volumePreset === "custom" && (
                <input
                  type="text"
                  value={volumeCustom}
                  placeholder="250m"
                  onChange={(e) => setVolumeCustom(e.target.value)}
                  className={`${inputClass} font-mono ${volumeValid ? "" : "border-red-500"}`}
                />
              )}
            </div>
            <Checkbox checked={solid} disabled={!caps.solid} onChange={setSolid} label={c.solid} />
            <Checkbox checked={recovery} disabled={!caps.recovery} onChange={setRecovery} label={c.recovery} />
            <Checkbox checked={deleteAfter} onChange={setDeleteAfter} label={c.deleteAfter} />
          </div>
        </div>
      </div>
    </Modal>
  );
};
