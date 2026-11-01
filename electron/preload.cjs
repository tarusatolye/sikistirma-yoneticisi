const { contextBridge, ipcRenderer, webUtils } = require('electron');

const listeners = new Map(); // event -> Set(callback)

ipcRenderer.on('app-event', (_e, { event, payload }) => {
  const set = listeners.get(event);
  if (!set) return;
  set.forEach((cb) => {
    try {
      cb(payload);
    } catch (err) {
      console.error('Error invoking event callback:', err);
    }
  });
});

contextBridge.exposeInMainWorld('bridge', {
  invoke: (cmd, args) => ipcRenderer.invoke('invoke', cmd, args),
  on: (event, cb) => {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(cb);
    return () => listeners.get(event).delete(cb);
  },
  ready: () => ipcRenderer.send('renderer-ready'),
  // Electron 32+ no longer exposes File.path; dropped files are resolved here.
  pathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return '';
    }
  }
});
