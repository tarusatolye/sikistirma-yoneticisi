import React, { useState } from "react";
import { KeyRound, Eye, EyeOff } from "lucide-react";
import { Modal, Button, inputClass } from "./Modal";
import { T, fmt } from "../i18n";

interface PasswordModalProps {
  t: T;
  archiveName: string;
  wrong: boolean;
  onSubmit: (password: string | null) => void;
}

export const PasswordModal: React.FC<PasswordModalProps> = ({ t, archiveName, wrong, onSubmit }) => {
  const [value, setValue] = useState("");
  const [show, setShow] = useState(false);
  const p = t.password;
  return (
    <Modal
      title={p.title}
      icon={<KeyRound size={14} />}
      onClose={() => onSubmit(null)}
      width="max-w-md"
      footer={
        <>
          <Button onClick={() => onSubmit(null)}>{p.cancel}</Button>
          <Button kind="primary" disabled={!value} onClick={() => onSubmit(value)}>
            {p.ok}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (value) onSubmit(value);
        }}
        className="space-y-3"
      >
        <p className={`text-xs leading-relaxed ${wrong ? "text-red-400" : "text-[#c0c5d1]"}`}>
          {wrong ? p.wrong : fmt(p.prompt, { name: archiveName })}
        </p>
        <div className="relative">
          <input
            autoFocus
            type={show ? "text" : "password"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={p.placeholder}
            className={`${inputClass} pr-9 font-mono`}
          />
          <button
            type="button"
            title={p.show}
            onClick={() => setShow((s) => !s)}
            className="absolute right-2 top-1.5 text-[#8e95a5] hover:text-white"
          >
            {show ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </form>
    </Modal>
  );
};
