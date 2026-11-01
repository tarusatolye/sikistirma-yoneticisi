// Thin wrapper over the preload bridge (electron/preload.cjs).
interface Bridge {
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<any>;
  on: (event: string, cb: (payload: any) => void) => () => void;
  ready: () => void;
  pathForFile: (file: File) => string;
}

declare global {
  interface Window {
    bridge: Bridge;
  }
}

export function invoke<T = any>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  return window.bridge.invoke(cmd, args);
}

export function listen<T = any>(event: string, cb: (payload: T) => void): () => void {
  return window.bridge.on(event, cb);
}

export function rendererReady() {
  window.bridge.ready();
}

export function pathForFile(file: File): string {
  return window.bridge.pathForFile(file);
}
