import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";

interface ComboboxOption<T extends string | number> {
  value: T;
  label: string;
}

interface ComboboxProps<T extends string | number> {
  value: T;
  options: ComboboxOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
}

export function Combobox<T extends string | number>({ value, options, onChange, ariaLabel }: ComboboxProps<T>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="relative"
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between bg-[#181a1e] border border-[#343a46] rounded-md px-3 py-1.5 text-xs text-white text-left focus:outline-none focus:border-violet-500 transition-colors"
      >
        <span className="truncate">{selected?.label ?? ""}</span>
        <ChevronDown size={14} className="text-[#8e95a5] shrink-0 ml-2" />
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label={ariaLabel}
          className="absolute z-50 mt-1 w-full bg-[#181a1e] border border-[#343a46] rounded-md shadow-lg py-1 max-h-56 overflow-auto"
        >
          {options.map((o) => (
            <li key={String(o.value)} role="option" aria-selected={o.value === value}>
              <button
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-left text-white hover:bg-[#352c4d]"
              >
                <span>{o.label}</span>
                {o.value === value && <Check size={14} className="text-violet-400" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
