import React, { useEffect } from "react";
import { X } from "lucide-react";

interface ModalProps {
  title: string;
  icon?: React.ReactNode;
  onClose?: () => void;
  width?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

// Shared dialog frame: same perde, header and colours as the download manager's settings window.
export const Modal: React.FC<ModalProps> = ({ title, icon, onClose, width = "max-w-lg", children, footer }) => {
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 modal-perde backdrop-blur-sm flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        className={`bg-[#24272d] border border-[#3b424e] rounded-xl w-full ${width} shadow-2xl overflow-hidden text-[#d4d8e2] text-xs font-sans`}
      >
        <div className="h-10 px-4 bg-[#1e2126] border-b border-[#323843] flex items-center justify-between select-none">
          <div className="flex items-center space-x-2 min-w-0">
            {icon && <span className="text-[#8e95a5] shrink-0">{icon}</span>}
            <span className="font-medium text-white truncate">{title}</span>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-[#8e95a5] hover:text-white p-1 rounded hover:bg-[#343a46] transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <div className="p-5">{children}</div>
        {footer && (
          <div className="flex items-center justify-end space-x-2 px-5 py-3 border-t border-[#323843] bg-[#212429]">{footer}</div>
        )}
      </div>
    </div>
  );
};

type ButtonKind = "primary" | "secondary" | "danger";

const KIND_CLASSES: Record<ButtonKind, string> = {
  primary: "bg-violet-600 hover:bg-violet-500 text-white border-violet-500 font-medium shadow-sm",
  secondary: "bg-[#2d323b] hover:bg-[#383e4a] text-[#cfd3dc] border-[#3b424e]",
  danger: "bg-red-600 hover:bg-red-500 text-white border-red-500 font-medium",
};

export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { kind?: ButtonKind }> = ({
  kind = "secondary",
  className = "",
  ...props
}) => (
  <button
    type="button"
    {...props}
    className={`px-3.5 py-1 rounded border text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${KIND_CLASSES[kind]} ${className}`}
  />
);

export const inputClass =
  "w-full bg-[#181a1e] border border-[#343a46] rounded-md px-3 py-1.5 text-xs text-white placeholder-[#6f7787] focus:outline-none focus:border-violet-500 transition-colors disabled:opacity-40";

export const Checkbox: React.FC<{ checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; label: string }> = ({
  checked,
  disabled,
  onChange,
  label,
}) => (
  <label className={`flex items-center space-x-2 ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}>
    <input
      type="checkbox"
      checked={checked && !disabled}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
      className="accent-violet-500 w-3.5 h-3.5"
    />
    <span>{label}</span>
  </label>
);
