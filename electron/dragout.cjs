// Dragging entries out of an open archive: extract them (path structure kept) into a fresh temp folder,
// then hand the top-level paths to the OS drag. Plain Node so the tests can drive it without Electron.
const fs = require('fs');
const os = require('os');
const path = require('path');
const sz = require('./sevenzip.cjs');

const DRAG_DIR_NAME = 'sikistirma-surukle';

function dragRoot() {
  return path.join(os.tmpdir(), DRAG_DIR_NAME);
}

// Extracts `names` of the archive into dragRoot()/<random>. Resolves to
// { status: 'ok', dir, paths } (paths = what to drag, each one exists), { status: 'password' } or { status: 'error', summary }.
async function extractForDrag(info, names, password, runOpts = {}) {
  fs.mkdirSync(dragRoot(), { recursive: true });
  const dir = fs.mkdtempSync(path.join(dragRoot(), 'd-'));
  const fail = (res) => {
    fs.rmSync(dir, { recursive: true, force: true });
    return res;
  };
  const r = await sz.run(sz.extractStages(info, names, dir, password, 'overwrite', false), runOpts);
  if (r.wrongPassword) return fail({ status: 'password' });
  if (!r.ok) return fail({ status: 'error', summary: r.errorSummary });
  const seen = new Set();
  const paths = [];
  for (const n of names) {
    const c = sz.safeComponents(n);
    if (!c || !c.length) continue;
    const p = path.join(dir, ...c);
    if (!seen.has(p) && fs.existsSync(p)) {
      seen.add(p);
      paths.push(p);
    }
  }
  // Dragging a folder and something inside it: the folder already carries it.
  const top = paths.filter((p) => !paths.some((o) => o !== p && p.startsWith(o + path.sep)));
  if (!top.length) return fail({ status: 'error', summary: 'Nothing was extracted' });
  return { status: 'ok', dir, paths: top };
}

module.exports = { DRAG_DIR_NAME, dragRoot, extractForDrag };
