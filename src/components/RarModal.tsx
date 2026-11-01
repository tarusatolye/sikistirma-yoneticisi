import React, { useState } from "react";
import { PackageOpen, ExternalLink } from "lucide-react";
import { Modal, Button } from "./Modal";
import { invoke } from "../bridge";
import { T, fmt } from "../i18n";

// Shown when RAR creation / modification is asked for without RARLAB's tool (it may not be bundled).
export const RarModal: React.FC<{ t: T; platform: string; downloadPage: string; onClose: (installed: boolean) => void }> = ({
  t,
  platform,
  downloadPage,
  onClose,
}) => {
  const r = t.rar;
  const win = platform === "win32";
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const choose = async () => {
    const res = await invoke<{ status: string; version?: string; reason?: string }>("choose_rar");
    if (res.status === "ok") {
      setMessage({ ok: true, text: fmt(r.installed, { version: res.version || "RAR" }) });
      setTimeout(() => onClose(true), 900);
    } else if (res.status === "error") {
      setMessage({ ok: false, text: res.reason === "not_working" ? r.notWorking : res.reason === "not_found" ? r.notFound : res.reason || r.notFound });
    }
  };

  return (
    <Modal
      title={r.title}
      icon={<PackageOpen size={14} />}
      onClose={() => onClose(false)}
      footer={
        <>
          <Button onClick={() => onClose(false)}>{r.cancel}</Button>
          <Button onClick={() => invoke("open_external", { url: downloadPage })} className="flex items-center space-x-1">
            <ExternalLink size={12} />
            <span>{r.downloadPage}</span>
          </Button>
          <Button kind="primary" onClick={choose}>
            {win ? r.chooseWin : r.chooseMac}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-xs text-[#c0c5d1] leading-relaxed">
        <p>{win ? r.textWin : r.textMac}</p>
        <ol className="list-decimal pl-5 space-y-1">
          {(win ? r.stepsWin : r.stepsMac).map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <p className="text-[#8e95a5]">{r.note}</p>
        {message && <p className={message.ok ? "text-emerald-400" : "text-red-400"}>{message.text}</p>}
      </div>
    </Modal>
  );
};
