import React from "react";
import { Info } from "lucide-react";
import { Modal, Button } from "./Modal";
import { T } from "../i18n";
import { ArchiveInfo, Lang } from "../types";
import { formatSize } from "../format";

export const InfoModal: React.FC<{ t: T; lang: Lang; info: ArchiveInfo; onClose: () => void }> = ({ t, lang, info, onClose }) => {
  const i = t.info;
  const files = info.entries.filter((e) => !e.isDir);
  const folders = new Set<string>();
  for (const e of info.entries) {
    const parts = e.path.split("/");
    for (let k = 1; k < (e.isDir ? parts.length + 1 : parts.length); k++) folders.add(parts.slice(0, k).join("/"));
  }
  const total = files.reduce((a, e) => a + e.size, 0);
  const packed = info.archiveSize || files.reduce((a, e) => a + e.packed, 0);
  const encrypted = info.headersEncrypted ? i.namesEncrypted : info.hasEncrypted ? i.yes : i.no;
  const rows: [string, string][] = [
    [i.path, info.path],
    [i.type, info.type],
    [i.archiveSize, formatSize(packed, lang)],
    [i.totalSize, formatSize(total, lang)],
    [i.ratio, total > 0 ? `${Math.round((packed * 100) / total)}%` : "-"],
    [i.files, String(files.length)],
    [i.folders, String(folders.size)],
    [i.method, info.method || "-"],
    [i.solid, info.solid ? i.yes : i.no],
    [i.encrypted, encrypted],
    [i.volumes, info.multiVolume ? (info.volumes > 1 ? `${i.yes} (${info.volumes})` : i.yes) : i.no],
    [i.modifiable, info.supportsModification ? i.yes : i.no],
  ];
  return (
    <Modal title={i.title} icon={<Info size={14} />} onClose={onClose} footer={<Button onClick={onClose}>{i.close}</Button>}>
      <dl className="grid grid-cols-[150px_1fr] gap-x-3 gap-y-1.5">
        {rows.map(([k, v]) => (
          <React.Fragment key={k}>
            <dt className="text-[#8e95a5]">{k}</dt>
            <dd className="text-white font-mono text-[11px] break-all select-text">{v}</dd>
          </React.Fragment>
        ))}
      </dl>
    </Modal>
  );
};
