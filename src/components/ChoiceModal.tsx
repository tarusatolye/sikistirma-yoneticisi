import React, { useState } from "react";
import { CircleCheck, Info, TriangleAlert, CircleHelp } from "lucide-react";
import { Modal, Button } from "./Modal";
import { T } from "../i18n";

export interface Choice<V extends string = string> {
  label: string;
  value: V;
  kind?: "primary" | "secondary" | "danger";
}

export interface ChoiceRequest {
  title: string;
  text?: string;
  items?: string[];
  details?: string;
  tone?: "info" | "success" | "error" | "question";
  choices: Choice[];
  cancelValue?: string;
}

const TONE_ICON = {
  info: <Info size={14} className="text-violet-400" />,
  success: <CircleCheck size={14} className="text-emerald-400" />,
  error: <TriangleAlert size={14} className="text-red-400" />,
  question: <CircleHelp size={14} className="text-violet-400" />,
};

// Message / question dialog: errors with 7-Zip output, overwrite and "archive exists" questions, confirmations.
export const ChoiceModal: React.FC<{ t: T; req: ChoiceRequest; onChoose: (value: string | null) => void }> = ({ t, req, onChoose }) => {
  const [showDetails, setShowDetails] = useState(false);
  return (
    <Modal
      title={req.title}
      icon={TONE_ICON[req.tone || "info"]}
      onClose={() => onChoose(req.cancelValue ?? null)}
      width="max-w-md"
      footer={req.choices.map((c, i) => (
        <Button key={c.value} kind={c.kind || "secondary"} autoFocus={i === req.choices.length - 1} onClick={() => onChoose(c.value)}>
          {c.label}
        </Button>
      ))}
    >
      <div className="space-y-3">
        {req.text && <p className="text-xs text-[#c0c5d1] leading-relaxed whitespace-pre-line select-text">{req.text}</p>}
        {req.items && req.items.length > 0 && (
          <ul className="max-h-32 overflow-y-auto bg-[#1b1e23] border border-[#343a46] rounded-md px-3 py-2 space-y-0.5 font-mono text-[11px] text-[#c0c5d1]">
            {req.items.slice(0, 200).map((it) => (
              <li key={it} className="truncate">
                {it}
              </li>
            ))}
          </ul>
        )}
        {req.details && (
          <div>
            <button type="button" onClick={() => setShowDetails((s) => !s)} className="text-[11px] text-violet-400 hover:text-violet-300">
              {showDetails ? t.result.hideDetails : t.result.showDetails}
            </button>
            {showDetails && (
              <pre className="mt-2 max-h-48 overflow-auto bg-[#15171b] border border-[#2c313a] rounded-md p-2 text-[10px] text-[#8e95a5] whitespace-pre-wrap select-text">
                {req.details}
              </pre>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
