import React, { useEffect, useState } from "react";
import { Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { Modal, Button } from "./Modal";
import { T } from "../i18n";
import { formatDuration } from "../format";

export interface ProgressState {
  title: string;
  subject: string;
  percent: number | null;
  file: string;
  files: string[];
  step: number;
  steps: number;
  startedAt: number;
}

// Total percent, elapsed / remaining time and the files 7-Zip reports, like MacRAR's progress window.
export const ProgressModal: React.FC<{ t: T; state: ProgressState; onCancel: () => void }> = ({ t, state, onCancel }) => {
  const [now, setNow] = useState(Date.now());
  const [details, setDetails] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  const elapsed = (now - state.startedAt) / 1000;
  const pct = state.percent;
  const remaining = pct && pct > 0 && pct < 100 ? (elapsed * (100 - pct)) / pct : pct === 100 ? 0 : NaN;
  const stepLabel = state.steps > 1 ? ` (${state.step + 1}/${state.steps})` : "";

  return (
    <Modal
      title={`${state.title}${stepLabel}`}
      icon={<Loader2 size={14} className="animate-spin text-violet-400" />}
      footer={<Button onClick={onCancel}>{t.progress.cancel}</Button>}
    >
      <div className="space-y-3">
        <div className="text-sm text-white font-medium truncate" title={state.subject}>
          {state.subject}
        </div>
        <div>
          <div className="w-full bg-[#2d323b] h-2 rounded-full overflow-hidden">
            {pct === null ? (
              <div className="h-full w-1/3 bg-[#8b5cf6] rounded-full animate-pulse" />
            ) : (
              <div className="bg-[#8b5cf6] h-full transition-all duration-300 rounded-full" style={{ width: `${Math.min(100, pct)}%` }} />
            )}
          </div>
          <div className="flex items-center justify-between mt-1.5 font-mono text-[11px] text-[#a0a7b6]">
            <span className="text-[#a78bfa] font-semibold">{pct === null ? "" : `${pct}%`}</span>
            <span>
              {t.progress.elapsed}: {formatDuration(elapsed)} · {t.progress.remaining}: {formatDuration(remaining)}
            </span>
          </div>
        </div>
        <div className="text-[11px] text-[#8e95a5] truncate font-mono" title={state.file}>
          {state.file || t.progress.preparing}
        </div>
        <div>
          <button
            type="button"
            onClick={() => setDetails((d) => !d)}
            className="flex items-center space-x-1 text-[11px] text-violet-400 hover:text-violet-300"
          >
            {details ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <span>
              {details ? t.progress.hideDetails : t.progress.details} ({state.files.length})
            </span>
          </button>
          {details && (
            <ul className="mt-2 h-36 overflow-y-auto bg-[#1b1e23] border border-[#343a46] rounded-md px-3 py-2 font-mono text-[11px] text-[#c0c5d1] space-y-0.5">
              {state.files.slice(-300).map((f, i) => (
                <li key={i} className="truncate">
                  {f}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
};
