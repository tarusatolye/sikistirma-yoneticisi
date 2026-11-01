// Renders docs/icon.svg with Electron (no other rasteriser needed) into:
//   docs/icon.png (1024), docs/icon.ico (16-256), docs/icon.icns (macOS, via iconutil),
//   public/favicon.ico, public/favicon-32.png, public/apple-touch-icon.png
// Usage: npm run icons
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const svg = fs.readFileSync(path.join(root, 'docs', 'icon.svg'), 'utf8');

// Draws the SVG onto a canvas in the page and reads the PNG back (capturePage hangs on hidden windows).
async function render(win, size) {
  const src = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
  const dataUrl = await win.webContents.executeJavaScript(`new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = ${size};
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, ${size}, ${size});
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = ${JSON.stringify(src)};
  })`);
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

// ICO with PNG-compressed images (supported since Windows Vista).
function ico(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const dir = Buffer.alloc(16 * pngs.length);
  let offset = 6 + dir.length;
  pngs.forEach(({ size, data }, i) => {
    const o = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o);
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1);
    dir.writeUInt16LE(1, o + 4);
    dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(data.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += data.length;
  });
  return Buffer.concat([header, dir, ...pngs.map((p) => p.data)]);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false });
  await win.loadURL('data:text/html,<html><body></body></html>');
  const cache = {};
  const png = async (s) => (cache[s] ||= await render(win, s));

  fs.writeFileSync(path.join(root, 'docs', 'icon.png'), await png(1024));
  const icoSizes = [16, 24, 32, 48, 64, 128, 256];
  const icoData = ico(await Promise.all(icoSizes.map(async (s) => ({ size: s, data: await png(s) }))));
  fs.writeFileSync(path.join(root, 'docs', 'icon.ico'), icoData);
  fs.writeFileSync(path.join(root, 'public', 'favicon.ico'), ico(await Promise.all([16, 32, 48].map(async (s) => ({ size: s, data: await png(s) })))));
  fs.writeFileSync(path.join(root, 'public', 'favicon-32.png'), await png(32));
  fs.writeFileSync(path.join(root, 'public', 'apple-touch-icon.png'), await png(180));

  if (process.platform === 'darwin') {
    const set = fs.mkdtempSync(path.join(os.tmpdir(), 'icon-')) + '/icon.iconset';
    fs.mkdirSync(set);
    for (const s of [16, 32, 128, 256, 512]) {
      fs.writeFileSync(path.join(set, `icon_${s}x${s}.png`), await png(s));
      fs.writeFileSync(path.join(set, `icon_${s}x${s}@2x.png`), await png(s * 2));
    }
    execFileSync('iconutil', ['-c', 'icns', set, '-o', path.join(root, 'docs', 'icon.icns')]);
    fs.rmSync(path.dirname(set), { recursive: true, force: true });
  } else {
    console.log('docs/icon.icns is only produced on macOS (iconutil).');
  }
  console.log('Icons written.');
  app.quit();
});
