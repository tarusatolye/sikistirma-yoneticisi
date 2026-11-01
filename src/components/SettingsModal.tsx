import React, { useEffect, useState } from "react";
import { X, Settings as SettingsIcon, Info, ExternalLink, GitFork, ShieldCheck, Heart, RefreshCw, PackageOpen, CircleCheck, CircleAlert } from "lucide-react";
import { AppSettings, ArchiveFormat, FORMAT_ORDER, Lang, RarStatus } from "../types";
import { translations, fmt } from "../i18n";
import { invoke } from "../bridge";
import { Combobox } from "./Combobox";
import { Checkbox } from "./Modal";
import { BrandMark } from "./BrandMark";

interface SettingsModalProps {
  onClose: () => void;
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
  lang: Lang;
}

// Mounted only while open, so its form state starts from the current settings each time.
export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose, settings, onSave, lang }) => {
  const t = translations[lang].settingsModal;
  const c = translations[lang].compress;

  const [activeTab, setActiveTab] = useState<"general" | "rar" | "about">("general");
  const [form, setForm] = useState<AppSettings>({ ...settings });
  const [updateStatus, setUpdateStatus] = useState<"idle" | "checking" | "latest" | "downloading" | "error">("idle");
  const [updateMessage, setUpdateMessage] = useState<string>("");
  const [rar, setRar] = useState<RarStatus | null>(null);
  const [rarError, setRarError] = useState("");

  useEffect(() => {
    if (activeTab === "rar") invoke<RarStatus>("rar_status").then(setRar);
  }, [activeTab]);

  const handleCheckUpdate = async () => {
    setUpdateStatus("checking");
    setUpdateMessage("");
    try {
      const res: any = await invoke("check_for_updates");
      if (res && res.status === "dev_mode") {
        setUpdateStatus("idle");
        setUpdateMessage(t.devMode);
      } else if (res && res.updateInfo && res.updateInfo.version && res.updateInfo.version !== __APP_VERSION__) {
        setUpdateStatus("downloading");
        setUpdateMessage(fmt(t.downloadingUpdate, { version: res.updateInfo.version }));
      } else if (res && res.status === "error") {
        setUpdateStatus("error");
        setUpdateMessage(t.updateError);
      } else {
        setUpdateStatus("latest");
        setUpdateMessage(fmt(t.upToDate, { version: __APP_VERSION__ }));
      }
    } catch {
      setUpdateStatus("error");
      setUpdateMessage(t.updateError);
    }
  };

  const chooseRar = async () => {
    setRarError("");
    const res = await invoke<{ status: string; reason?: string }>("choose_rar");
    if (res.status === "error") {
      const r = translations[lang].rar;
      setRarError(res.reason === "not_working" ? r.notWorking : r.notFound);
    }
    invoke<RarStatus>("rar_status").then(setRar);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form);
    onClose();
  };

  const tabClass = (tab: string) =>
    `flex items-center space-x-1.5 py-2.5 px-3 border-b-2 font-medium text-xs transition-colors ${
      activeTab === tab ? "border-violet-500 text-white" : "border-transparent text-[#8e95a5] hover:text-[#d4d8e2]"
    }`;

  const secondaryButton =
    "px-3.5 py-1 bg-[#2d323b] hover:bg-[#383e4a] text-[#cfd3dc] rounded border border-[#3b424e] transition-colors text-xs";

  return (
    <div className="fixed inset-0 z-50 modal-perde backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#24272d] border border-[#3b424e] rounded-xl w-full max-w-lg shadow-2xl overflow-hidden text-[#d4d8e2] text-xs font-sans">
        {/* Header with Title and Close Button */}
        <div className="h-10 px-4 bg-[#1e2126] border-b border-[#323843] flex items-center justify-between select-none">
          <div className="flex items-center space-x-2">
            <SettingsIcon size={14} className="text-[#8e95a5]" />
            <span className="font-medium text-white">{t.title}</span>
          </div>
          <button onClick={onClose} className="text-[#8e95a5] hover:text-white p-1 rounded hover:bg-[#343a46] transition-colors">
            <X size={14} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[#323843] bg-[#212429] px-4 select-none">
          <button type="button" onClick={() => setActiveTab("general")} className={tabClass("general")}>
            <SettingsIcon size={13} />
            <span>{t.tabGeneral}</span>
          </button>
          <button type="button" onClick={() => setActiveTab("rar")} className={tabClass("rar")}>
            <PackageOpen size={13} />
            <span>{t.tabRar}</span>
          </button>
          <button type="button" onClick={() => setActiveTab("about")} className={tabClass("about")}>
            <Info size={13} />
            <span>{t.tabAbout}</span>
          </button>
        </div>

        {/* Tab 1: General Settings */}
        {activeTab === "general" && (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[#8e95a5] font-medium">{t.language}</label>
                <Combobox
                  ariaLabel={t.language}
                  value={form.language}
                  onChange={(v) => setForm({ ...form, language: v as Lang })}
                  options={[
                    { value: "tr", label: "Türkçe (Sıkıştırma Yöneticisi)" },
                    { value: "en", label: "English (Archive Manager)" },
                  ]}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[#8e95a5] font-medium">{t.defaultFormat}</label>
                <Combobox
                  ariaLabel={t.defaultFormat}
                  value={form.default_format}
                  onChange={(v) => setForm({ ...form, default_format: v as ArchiveFormat })}
                  options={FORMAT_ORDER.map((f) => ({ value: f, label: f === "tar" ? c.tarPlain : f === "rar" ? "RAR 5" : f === "7z" ? "7z" : f.toUpperCase() }))}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[#8e95a5] font-medium">{t.defaultLevel}</label>
              <Combobox
                ariaLabel={t.defaultLevel}
                value={form.default_level}
                onChange={(v) => setForm({ ...form, default_level: v })}
                options={c.levels.map((l, i) => ({ value: i, label: l }))}
              />
            </div>

            <Checkbox
              checked={form.reveal_after_extract}
              onChange={(v) => setForm({ ...form, reveal_after_extract: v })}
              label={t.revealAfterExtract}
            />

            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-[#323843]">
              <button type="button" onClick={onClose} className={secondaryButton}>
                {t.cancel}
              </button>
              <button type="submit" className="px-3.5 py-1 bg-violet-600 hover:bg-violet-500 text-white rounded font-medium shadow-sm transition-colors text-xs">
                {t.save}
              </button>
            </div>
          </form>
        )}

        {/* Tab 2: RAR tool */}
        {activeTab === "rar" && (
          <div className="p-5 space-y-4">
            <p className="text-xs text-[#c0c5d1] leading-relaxed">{t.rarInfo}</p>
            <div className="bg-[#1b1e23] border border-[#343a46] rounded-lg p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[#8e95a5]">{t.rarStatus}</span>
                {rar?.available ? (
                  <span className="flex items-center space-x-1 text-emerald-400">
                    <CircleCheck size={13} />
                    <span>
                      {t.rarFound}
                      {rar.version ? ` (${rar.version})` : ""}
                    </span>
                  </span>
                ) : (
                  <span className="flex items-center space-x-1 text-amber-400">
                    <CircleAlert size={13} />
                    <span>{t.rarMissing}</span>
                  </span>
                )}
              </div>
              {rar?.path && (
                <div className="flex items-center justify-between space-x-3">
                  <span className="text-[#8e95a5] shrink-0">{t.rarPath}</span>
                  <span className="font-mono text-[11px] text-white truncate select-text" title={rar.path}>
                    {rar.path}
                  </span>
                </div>
              )}
            </div>
            {rarError && <p className="text-[11px] text-red-400">{rarError}</p>}
            <div className="flex items-center justify-between pt-3 border-t border-[#323843]">
              <button
                type="button"
                onClick={() => invoke("open_external", { url: rar?.downloadPage || "https://www.rarlab.com/download.htm" })}
                className="inline-flex items-center space-x-1.5 text-xs text-violet-400 hover:text-violet-300"
              >
                <ExternalLink size={12} />
                <span>{t.rarDownload}</span>
              </button>
              <div className="flex items-center space-x-2">
                <button type="button" onClick={chooseRar} className={secondaryButton}>
                  {t.rarChoose}
                </button>
                <button type="button" onClick={onClose} className={secondaryButton}>
                  {t.close}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: About & Open Source Attribution */}
        {activeTab === "about" && (
          <div className="p-5 space-y-4">
            <div className="flex items-center space-x-3.5 bg-[#1e2126] p-3.5 rounded-lg border border-[#343a46]">
              <BrandMark className="w-11 h-11 rounded-lg" />
              <div>
                <div className="flex items-center space-x-2.5">
                  <h3 className="font-semibold text-white text-sm">{t.aboutTitle}</h3>
                  <span className="text-[11px] text-[#8e95a5] font-mono select-all">v.{__APP_VERSION__}</span>
                  <button
                    type="button"
                    onClick={handleCheckUpdate}
                    disabled={updateStatus === "checking"}
                    className="flex items-center space-x-1 text-[11px] px-2 py-0.5 rounded bg-[#2a2f3a] hover:bg-[#353c4a] text-violet-400 border border-[#3b4352] transition-colors disabled:opacity-50"
                  >
                    <RefreshCw size={10} className={updateStatus === "checking" ? "animate-spin" : ""} />
                    <span>{updateStatus === "checking" ? t.checking : t.checkUpdates}</span>
                  </button>
                </div>
                <p className="text-[11px] text-[#8e95a5] mt-0.5">{t.aboutSubtitle}</p>
                {updateMessage && (
                  <p
                    className={`text-[11px] mt-1 ${
                      updateStatus === "error" ? "text-red-400" : updateStatus === "latest" ? "text-emerald-400" : "text-violet-400"
                    }`}
                  >
                    {updateMessage}
                  </p>
                )}
              </div>
            </div>

            {/* Attribution Box */}
            <div className="bg-[#1b1e23] border border-[#343a46] rounded-lg p-3.5 space-y-2.5">
              <div className="flex items-center space-x-1.5 text-violet-400 font-medium text-xs">
                <GitFork size={14} />
                <span>{t.attributionTitle}</span>
              </div>
              <p className="text-xs text-[#c0c5d1] leading-relaxed">{t.attributionText}</p>
              <div className="pt-1 flex flex-wrap gap-2">
                {[
                  ["https://github.com/mstcvk/MacRAR", t.macrarLink],
                  ["https://github.com/tarusatolye/sikistirma-yoneticisi", t.repoLink],
                ].map(([url, label]) => (
                  <button
                    key={url}
                    type="button"
                    onClick={() => invoke("open_external", { url })}
                    className="inline-flex items-center space-x-1.5 text-xs text-violet-400 hover:text-violet-300 bg-violet-950/40 hover:bg-violet-900/50 px-2.5 py-1 rounded border border-violet-800/40 transition-colors"
                  >
                    <ExternalLink size={12} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* License & Components */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-[#1b1e23] border border-[#343a46] rounded-lg p-3 space-y-1">
                <div className="flex items-center space-x-1.5 text-[#a2d8a2] font-medium">
                  <ShieldCheck size={13} />
                  <span>{t.license}</span>
                </div>
                <p className="text-[#8e95a5] text-[11px]">{t.licenseType}</p>
                <p className="text-[10px] text-violet-400 mt-1">© 2026 tarusatolye · © 2026 Mesut Çevik</p>
              </div>

              <div className="bg-[#1b1e23] border border-[#343a46] rounded-lg p-3 space-y-1">
                <div className="flex items-center space-x-1.5 text-pink-400 font-medium">
                  <Heart size={13} />
                  <span>{t.coreEngines}</span>
                </div>
                <p className="text-[#8e95a5] text-[11px]">7-Zip, React, Electron</p>
                <p className="text-[10px] text-[#8e95a5] mt-1">{t.publisher}</p>
              </div>
            </div>

            <div className="bg-[#15171b] border border-[#2c313a] rounded-lg p-3 text-[11px] text-[#8e95a5] space-y-1">
              <div className="text-white font-medium text-xs">{t.thirdParty}</div>
              <p className="leading-relaxed">{t.thirdPartyText}</p>
            </div>

            <div className="flex items-center justify-end pt-2 border-t border-[#323843]">
              <button type="button" onClick={onClose} className={secondaryButton}>
                {t.close}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
