import { ArchiveEntry } from "./types";

export interface TreeNode {
  path: string; // "" for the archive root
  name: string;
  isDir: boolean;
  size: number;
  packed: number;
  mtime: string;
  crc: string;
  encrypted: boolean;
  method: string;
  children: TreeNode[];
}

// Builds the folder tree from the flat 7-Zip listing. Intermediate folders that are not entries of their own
// (common in zip/tar) are created; folder sizes are the sums of what they contain.
export function buildTree(entries: ArchiveEntry[]): { root: TreeNode; byPath: Map<string, TreeNode> } {
  const root: TreeNode = { path: "", name: "", isDir: true, size: 0, packed: 0, mtime: "", crc: "", encrypted: false, method: "", children: [] };
  const byPath = new Map<string, TreeNode>([["", root]]);

  const ensureDir = (p: string): TreeNode => {
    const found = byPath.get(p);
    if (found) return found;
    const i = p.lastIndexOf("/");
    const parent = ensureDir(i >= 0 ? p.slice(0, i) : "");
    const node: TreeNode = { path: p, name: p.slice(i + 1), isDir: true, size: 0, packed: 0, mtime: "", crc: "", encrypted: false, method: "", children: [] };
    parent.children.push(node);
    byPath.set(p, node);
    return node;
  };

  for (const e of entries) {
    const p = e.path.replace(/^(\.\/)+/, "");
    if (!p) continue;
    if (e.isDir) {
      const d = ensureDir(p);
      d.mtime = e.mtime;
      continue;
    }
    if (byPath.has(p)) continue;
    const i = p.lastIndexOf("/");
    const parent = ensureDir(i >= 0 ? p.slice(0, i) : "");
    const node: TreeNode = {
      path: e.path,
      name: p.slice(i + 1),
      isDir: false,
      size: e.size,
      packed: e.packed,
      mtime: e.mtime,
      crc: e.crc,
      encrypted: e.encrypted,
      method: e.method,
      children: [],
    };
    parent.children.push(node);
    byPath.set(p, node);
  }

  const sum = (n: TreeNode) => {
    if (!n.isDir) return;
    let size = 0;
    let packed = 0;
    let enc = false;
    for (const c of n.children) {
      sum(c);
      size += c.size;
      packed += c.packed;
      enc = enc || c.encrypted;
    }
    n.size = size;
    n.packed = packed;
    n.encrypted = enc;
  };
  sum(root);
  return { root, byPath };
}

export function parentPath(p: string): string {
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(0, i) : "";
}
