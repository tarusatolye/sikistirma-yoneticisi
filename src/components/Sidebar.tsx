import React, { useEffect, useState } from "react";
import { Folder, FolderOpen, ChevronDown, ChevronRight, PanelLeftClose, PanelLeft, History, Trash2, FileArchive } from "lucide-react";
import { TreeNode } from "../tree";
import { T } from "../i18n";
import { baseName } from "../format";

interface SidebarProps {
  t: T;
  root: TreeNode | null;
  archiveName: string;
  currentDir: string;
  onSelectDir: (path: string) => void;
  recent: string[];
  activeArchive: string | null;
  onOpenRecent: (path: string) => void;
  onClearRecent: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  t,
  root,
  archiveName,
  currentDir,
  onSelectDir,
  recent,
  activeArchive,
  onOpenRecent,
  onClearRecent,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set([""]));
  const [recentOpen, setRecentOpen] = useState(true);

  // Keep the folder shown in the table visible in the tree.
  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.add("");
      const parts = currentDir ? currentDir.split("/") : [];
      for (let i = 1; i < parts.length; i++) next.add(parts.slice(0, i).join("/"));
      return next;
    });
  }, [currentDir]);

  useEffect(() => setExpanded(new Set([""])), [root]);

  if (collapsed) {
    return (
      <aside className="w-10 bg-[#212429] border-r border-[#16181b] flex flex-col items-center select-none">
        <div className="h-10 flex items-center">
          <button onClick={() => setCollapsed(false)} className="text-[#8e95a5] hover:text-white transition-colors">
            <PanelLeft size={15} />
          </button>
        </div>
      </aside>
    );
  }

  const toggle = (p: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });

  const renderNode = (node: TreeNode, depth: number): React.ReactNode => {
    const dirs = node.children.filter((c) => c.isDir).sort((a, b) => a.name.localeCompare(b.name));
    const isOpen = expanded.has(node.path);
    const isSelected = currentDir === node.path;
    return (
      <div key={node.path || "/"}>
        <div
          onClick={() => onSelectDir(node.path)}
          style={{ paddingLeft: 6 + depth * 14 }}
          className={`flex items-center pr-2 py-1 rounded-md cursor-pointer transition-colors ${
            isSelected ? "bg-[#333a46] text-white font-medium" : "hover:bg-[#282c33] text-[#cfd3dc]"
          }`}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggle(node.path);
            }}
            className={`text-[#8e95a5] hover:text-white p-0.5 mr-0.5 ${dirs.length ? "" : "invisible"}`}
          >
            {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
          {node.path === "" ? (
            <FileArchive size={15} className="text-[#a78bfa] shrink-0" />
          ) : isOpen || isSelected ? (
            <FolderOpen size={15} className="text-[#8e95a5] shrink-0" />
          ) : (
            <Folder size={15} className="text-[#8e95a5] shrink-0" />
          )}
          <span className="ml-2 truncate">{node.path === "" ? archiveName : node.name}</span>
        </div>
        {isOpen && dirs.map((d) => renderNode(d, depth + 1))}
      </div>
    );
  };

  return (
    <aside className="w-60 bg-[#212429] border-r border-[#16181b] flex flex-col select-none text-[#cfd3dc] text-[13px] font-sans shrink-0">
      <div className="h-10 px-3 flex items-center justify-between border-b border-[#16181b] text-[#8e95a5]">
        <span className="text-xs font-medium opacity-60">{t.sidebar.folders}</span>
        <button onClick={() => setCollapsed(true)} className="hover:text-white transition-colors">
          <PanelLeftClose size={15} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        {root ? renderNode(root, 0) : <div className="px-2.5 py-1.5 text-xs text-[#6e7687]">{t.sidebar.noArchive}</div>}

        {recent.length > 0 && (
          <>
            <div className="pt-2 pb-1">
              <div className="h-px bg-[#2d323b] mx-2" />
            </div>
            <div className="group flex items-center justify-between px-1.5 py-1 text-[#8e95a5]">
              <button onClick={() => setRecentOpen((o) => !o)} className="flex items-center space-x-1.5 hover:text-white">
                {recentOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                <History size={14} />
                <span className="text-xs">{t.sidebar.recent}</span>
              </button>
              <button title={t.sidebar.clearRecent} onClick={onClearRecent} className="tarus-satir-islem p-0.5 hover:text-red-400 rounded">
                <Trash2 size={12} />
              </button>
            </div>
            {recentOpen &&
              recent.map((p) => (
                <div
                  key={p}
                  title={p}
                  onClick={() => onOpenRecent(p)}
                  className={`flex items-center space-x-2 pl-7 pr-2 py-1 rounded-md cursor-pointer transition-colors ${
                    p === activeArchive ? "text-white" : "text-[#a9b0c0] hover:bg-[#282c33]"
                  }`}
                >
                  <FileArchive size={13} className="text-[#8e95a5] shrink-0" />
                  <span className="truncate text-xs">{baseName(p)}</span>
                </div>
              ))}
          </>
        )}
      </div>
    </aside>
  );
};
