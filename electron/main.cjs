const { app, BrowserWindow, ipcMain, shell, Menu, dialog, nativeImage } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const os = require('os');
const sz = require('./sevenzip.cjs');
const rarTools = require('./rartools.cjs');

// Ensure single instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

// Data storage paths
const userDataPath = app.getPath('userData');
const settingsJsonPath = path.join(userDataPath, 'settings.json');
const rarInstallDir = path.join(userDataPath, 'rar');

// Default settings
let settings = {
  language: 'tr',
  default_format: 'zip',
  default_level: 3,
  reveal_after_extract: true,
  rar_path: '',
  recent: []
};

if (fs.existsSync(settingsJsonPath)) {
  try {
    const loaded = JSON.parse(fs.readFileSync(settingsJsonPath, 'utf8'));
    settings = { ...settings, ...loaded };
  } catch (e) {
    console.error('Failed to load settings:', e);
  }
}
if (process.env.SY_LANG === 'tr' || process.env.SY_LANG === 'en') settings.language = process.env.SY_LANG;

function saveSettingsFile() {
  try {
    fs.mkdirSync(userDataPath, { recursive: true });
    fs.writeFileSync(settingsJsonPath, JSON.stringify(settings, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to save settings:', e);
  }
}

function addRecent(p) {
  settings.recent = [p, ...(settings.recent || []).filter((r) => r !== p)].slice(0, 10);
  saveSettingsFile();
}

let mainWindow = null;

function emit(event, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app-event', { event, payload });
  }
}

function focusWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
}

// Files handed over by the OS (double-click, "Open with", argv) before the window is ready wait here.
let pendingPaths = [];
let rendererReady = false;

function openPaths(paths) {
  const existing = paths.filter((p) => p && fs.existsSync(p));
  if (!existing.length) return;
  if (rendererReady) {
    emit('open_paths', existing);
    focusWindow();
  } else {
    pendingPaths.push(...existing);
  }
}

function pathsFromArgv(argv) {
  return argv.slice(app.isPackaged ? 1 : 2).filter((a) => !a.startsWith('-') && fs.existsSync(a) && !a.endsWith('main.cjs'));
}

function rarPath() {
  return rarTools.findRar(settings.rar_path, rarInstallDir);
}

// Listings by archive path: jobs reuse what the window shows instead of listing again.
const archives = new Map();
const jobs = new Map();
let nextJobId = 1;

function runOpts(cwd) {
  return { rarPath: rarPath(), cwd };
}

// Runs stage groups one after another as a single job, forwarding progress to the renderer.
function startJob(kind, groups, extra = {}) {
  const id = nextJobId++;
  const state = { cancelled: false, current: null };
  jobs.set(id, state);
  const cleanups = groups.map((g) => g.cleanup).filter(Boolean);
  (async () => {
    let result = null;
    for (let i = 0; i < groups.length; i++) {
      if (state.cancelled) break;
      const g = groups[i];
      result = await new Promise((resolve) => {
        const job = new sz.Job(g.stages, runOpts(g.cwd));
        state.current = job;
        job
          .on('file', (file) => emit('job_progress', { id, file, step: i, steps: groups.length, title: g.title }))
          .on('percent', (percent) => emit('job_progress', { id, percent, step: i, steps: groups.length, title: g.title }))
          .on('done', resolve)
          .start();
      });
      if (!result.ok) break;
    }
    for (const c of cleanups) fs.rmSync(c, { force: true });
    jobs.delete(id);
    const r = result ? result.toJSON() : { ok: false, cancelled: true };
    if (state.cancelled) r.cancelled = true;
    emit('job_done', { id, kind, result: r, ...extra });
  })();
  return id;
}

function needInfo(p) {
  const info = archives.get(p);
  if (!info) throw new Error('Archive is not open: ' + p);
  return info;
}

function existsNoFollow(p) {
  try {
    fs.lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

const tempDirs = [];
function makeTempDir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sikistirma-ac-'));
  tempDirs.push(d);
  return d;
}

// docs/ is not packaged (build.files), so the drag icon comes from the system file icon; startDrag throws on an empty icon.
async function dragIcon(file) {
  let icon = file ? await app.getFileIcon(file, { size: 'normal' }).catch(() => null) : null;
  if (!icon || icon.isEmpty()) icon = nativeImage.createFromPath(path.join(__dirname, '..', 'dist', 'favicon-32.png'));
  if (icon.isEmpty()) icon = nativeImage.createFromPath(path.join(__dirname, '..', 'public', 'favicon-32.png'));
  return icon;
}

ipcMain.on('renderer-ready', (e) => {
  rendererReady = true;
  if (pendingPaths.length) {
    const p = pendingPaths;
    pendingPaths = [];
    e.sender.send('app-event', { event: 'open_paths', payload: p });
  }
});

ipcMain.handle('invoke', async (e, cmd, args = {}) => {
  switch (cmd) {
    case 'get_settings':
      return settings;

    case 'save_settings': {
      settings = { ...settings, ...(args.newSettings || {}) };
      saveSettingsFile();
      return settings;
    }

    case 'get_environment':
      return {
        platform: process.platform,
        sep: path.sep,
        sevenZipFound: fs.existsSync(sz.sevenZipPath()),
        home: os.homedir()
      };

    case 'open_archive_dialog': {
      const r = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [
          { name: args.filterName || 'Archives', extensions: ['rar', 'zip', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'zst', 'cab', 'iso', '001', '*'] }
        ]
      });
      return r.canceled ? null : r.filePaths[0];
    }

    case 'choose_items': {
      // Windows and Linux cannot pick files and folders in the same dialog.
      const props = ['multiSelections', args.folders ? 'openDirectory' : 'openFile'];
      if (process.platform === 'darwin') props.push('openFile', 'openDirectory');
      const r = await dialog.showOpenDialog(mainWindow, { properties: props, defaultPath: args.defaultPath });
      return r.canceled ? [] : r.filePaths;
    }

    case 'choose_folder': {
      const r = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory', 'createDirectory'],
        defaultPath: args.defaultPath
      });
      return r.canceled ? null : r.filePaths[0];
    }

    case 'choose_save_path': {
      const r = await dialog.showSaveDialog(mainWindow, { defaultPath: args.defaultPath });
      return r.canceled ? null : r.filePath;
    }

    case 'list_archive': {
      const p = args.path;
      if (!p || !fs.existsSync(p)) return { status: 'error', notArchive: false, summary: 'not_found', output: '' };
      const res = await sz.list(p, args.password || null, runOpts());
      if (res.status === 'ok') {
        archives.set(p, res.info);
        addRecent(p);
      }
      return res;
    }

    case 'close_archive':
      archives.delete(args.path);
      return null;

    case 'path_info': {
      const p = args.path;
      let isDir = false;
      try { isDir = fs.statSync(p).isDirectory(); } catch {}
      return {
        exists: fs.existsSync(p),
        isDir,
        isArchive: sz.isArchive(p),
        dirname: path.dirname(p),
        basename: path.basename(p),
        folderNamedAfter: sz.folderNamedAfterArchive(p)
      };
    }

    case 'default_archive_path':
      return sz.defaultArchivePath(args.items || [], args.format || 'zip');

    case 'replace_format_ext':
      return sz.replaceFormatExt(args.path, args.format);

    case 'unique_path':
      return sz.uniquePath(args.path);

    case 'check_conflicts': {
      const info = needInfo(args.path);
      const tops = sz.topLevelNames(info.entries, args.names || null);
      return tops.filter((t) => existsNoFollow(path.join(args.dest, t)));
    }

    case 'start_extract': {
      const info = needInfo(args.path);
      if (info.hasUnsafePaths) return { error: 'unsafe_paths' };
      fs.mkdirSync(args.dest, { recursive: true });
      return {
        id: startJob('extract', [{ title: 'extract', stages: sz.extractStages(info, args.names || null, args.dest, args.password, args.mode || 'rename') }], {
          dest: args.dest,
          path: args.path
        })
      };
    }

    case 'start_test': {
      const info = needInfo(args.path);
      return { id: startJob('test', [{ title: 'test', stages: sz.testStages(info, args.password) }], { path: args.path }) };
    }

    case 'start_compress': {
      const o = args.options || {};
      if (o.format === 'rar' && !rarPath()) return { error: 'rar_missing' };
      const steps = sz.compressSteps(args.items, o);
      const cwd = path.dirname(o.archivePath);
      return {
        id: startJob('compress', steps.map((s) => ({ title: s.title, stages: [s], cleanup: s.cleanup, cwd })), { path: o.archivePath })
      };
    }

    case 'start_add': {
      const info = needInfo(args.path);
      if (!info.supportsModification) return { error: 'not_supported' };
      if (info.isRar && !rarPath()) return { error: 'rar_missing' };
      return { id: startJob('add', [{ title: 'add', stages: sz.addStages(info, args.items, args.password) }], { path: args.path }) };
    }

    case 'start_delete': {
      const info = needInfo(args.path);
      if (!info.supportsModification) return { error: 'not_supported' };
      if (info.isRar && !rarPath()) return { error: 'rar_missing' };
      return { id: startJob('delete', [{ title: 'delete', stages: sz.deleteStages(info, args.names, args.password) }], { path: args.path }) };
    }

    case 'cancel_job': {
      const j = jobs.get(args.id);
      if (j) {
        j.cancelled = true;
        if (j.current) j.current.cancel();
      }
      return null;
    }

    // Double-clicked file: extract it alone into a temp folder and open it with the default app.
    case 'open_entry': {
      const info = needInfo(args.path);
      const dir = makeTempDir();
      const r = await sz.run(sz.extractStages(info, [args.entry], dir, args.password, 'overwrite', true), runOpts());
      if (r.wrongPassword) return { status: 'password' };
      if (!r.ok) return { status: 'error', summary: r.errorSummary, output: r.output.slice(-20000) };
      const file = path.join(dir, path.basename(args.entry));
      const err = await shell.openPath(file);
      return err ? { status: 'error', summary: err, output: '' } : { status: 'ok' };
    }

    // Dragging entries out of the window: extract them (with their folders) to a temp folder, then start a native file drag.
    case 'drag_out': {
      const info = needInfo(args.path);
      const dir = makeTempDir();
      const names = args.entries || [];
      const planned = names.map((n) => path.resolve(dir, n)).filter((f) => f.startsWith(dir + path.sep));
      // macOS starts a native drag only while the mouse button is still down, and extraction (7zz spawn,
      // Gatekeeper scan on first run) outlasts a quick drag. So on macOS the drag starts at once with the
      // planned paths (folders created now); Finder reads the files on drop, after they are extracted.
      const early = process.platform === 'darwin' && planned.length > 0;
      if (early) {
        for (const n of names) {
          const f = path.resolve(dir, n);
          if (f.startsWith(dir + path.sep) && info.entries.some((x) => (x.path === n ? x.isDir : x.path.startsWith(n + '/')))) fs.mkdirSync(f, { recursive: true });
        }
        e.sender.startDrag({ file: planned[0], files: planned, icon: await dragIcon(null) });
      }
      const r = await sz.run(sz.extractStages(info, names, dir, args.password, 'overwrite'), runOpts());
      if (r.wrongPassword) return { status: 'password' };
      if (!r.ok) return { status: 'error', summary: r.errorSummary, output: r.output.slice(-20000) };
      const files = planned.filter((f) => existsNoFollow(f));
      if (!files.length) return { status: 'error', summary: 'nothing extracted', output: '' };
      if (!early) e.sender.startDrag({ file: files[0], files, icon: await dragIcon(files[0]) });
      return { status: 'ok' };
    }

    case 'reveal': {
      const p = args.path;
      if (p && fs.existsSync(p)) shell.showItemInFolder(p);
      else if (p) shell.openPath(path.dirname(p));
      return null;
    }

    case 'open_path':
      if (args.path) await shell.openPath(args.path);
      return null;

    case 'open_external':
      if (/^https:\/\//.test(args.url || '')) await shell.openExternal(args.url);
      return null;

    case 'rar_status': {
      const p = rarPath();
      return { available: Boolean(p), path: p, version: rarTools.rarVersion(p), downloadPage: rarTools.DOWNLOAD_PAGE };
    }

    case 'choose_rar': {
      const props = process.platform === 'darwin' ? ['openFile', 'openDirectory'] : ['openFile'];
      const r = await dialog.showOpenDialog(mainWindow, {
        properties: props,
        defaultPath: process.platform === 'win32' ? 'C:\\Program Files\\WinRAR' : app.getPath('downloads'),
        filters: process.platform === 'win32' ? [{ name: 'Rar.exe', extensions: ['exe'] }] : undefined
      });
      if (r.canceled) return { status: 'cancelled' };
      try {
        const p = rarTools.installFrom(r.filePaths[0], rarInstallDir, sz.sevenZipPath());
        const version = rarTools.rarVersion(p);
        if (!version) return { status: 'error', reason: 'not_working' };
        settings.rar_path = p;
        saveSettingsFile();
        return { status: 'ok', path: p, version };
      } catch (e) {
        return { status: 'error', reason: e.message === 'not_found' ? 'not_found' : e.message };
      }
    }

    case 'check_for_updates': {
      if (!app.isPackaged) {
        return { status: 'dev_mode' };
      }
      try {
        const res = await autoUpdater.checkForUpdates();
        return { status: 'checked', updateInfo: res ? res.updateInfo : null };
      } catch (err) {
        return { status: 'error', error: err ? err.message : String(err) };
      }
    }

    case 'restart_and_update': {
      autoUpdater.quitAndInstall();
      return null;
    }

    default:
      console.warn('Unhandled command:', cmd, args);
      return null;
  }
});

function buildMenu() {
  // Windows/Linux: no menu bar, like the download manager. macOS keeps the app and edit menus so Cmd+Q / Cmd+C work.
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
    return;
  }
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: 'appMenu' },
      { role: 'editMenu' },
      { role: 'windowMenu' }
    ])
  );
}

function createWindow() {
  buildMenu();

  mainWindow = new BrowserWindow({
    width: 1100,
    height: 680,
    minWidth: 820,
    minHeight: 480,
    title: 'Sıkıştırma Yöneticisi',
    icon: path.join(__dirname, '..', 'docs', 'icon.png'),
    backgroundColor: '#181a1e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  // Dropping a file outside the drop handlers must not navigate away from the app.
  mainWindow.webContents.on('will-navigate', (e) => e.preventDefault());

  const distPath = path.join(__dirname, '..', 'dist', 'index.html');
  if (fs.existsSync(distPath)) {
    mainWindow.loadFile(distPath);
  } else {
    mainWindow.loadURL('http://localhost:5173');
  }

  // SY_SNAPSHOT=/path/file.png: save the window after SY_SNAPSHOT_DELAY seconds and quit (README screenshots).
  if (process.env.SY_SNAPSHOT) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        const img = await mainWindow.webContents.capturePage();
        fs.writeFileSync(process.env.SY_SNAPSHOT, img.toPNG());
        app.quit();
      }, Number(process.env.SY_SNAPSHOT_DELAY || 2) * 1000);
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    rendererReady = false;
  });
}

app.on('second-instance', (_event, commandLine) => {
  focusWindow();
  if (Array.isArray(commandLine)) openPaths(pathsFromArgv(commandLine));
});

// macOS: double-click in Finder / "Open With" (may arrive before ready).
app.on('open-file', (event, p) => {
  event.preventDefault();
  openPaths([p]);
});

// Auto-updater configuration
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

autoUpdater.on('update-downloaded', (info) => {
  emit('update_downloaded', { version: info.version });
});

autoUpdater.on('error', (err) => {
  console.log('autoUpdater error:', err ? err.message : err);
});

app.whenReady().then(() => {
  createWindow();
  openPaths(pathsFromArgv(process.argv));

  if (app.isPackaged) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((e) => console.log('Auto-update check on launch error:', e));
    }, 5000);
    setInterval(() => {
      autoUpdater.checkForUpdates().catch((e) => console.log('Hourly update check error:', e));
    }, 60 * 60 * 1000);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  for (const j of jobs.values()) {
    j.cancelled = true;
    if (j.current) j.current.cancel();
  }
  for (const d of tempDirs) fs.rmSync(d, { recursive: true, force: true });
});
