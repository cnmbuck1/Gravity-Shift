// Renders the iOS app icon and launch image (see draw.ts) into ios/App/App/Assets.xcassets.
// Usage from the repo root (needs Playwright's Chromium):
//   node tools/ios-assets/render.mjs [--icon grid|maze|shift|tilt]   write the app icon + launch image
//   node tools/ios-assets/render.mjs --preview <dir>                  write every icon concept to <dir>
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Playwright is resolved like a CommonJS require so a global install (NODE_PATH) also works.
const { chromium } = createRequire(import.meta.url)('playwright');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const xc = resolve(root, 'ios/App/App/Assets.xcassets');
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const previewDir = arg('--preview');
const query = new URLSearchParams();
if (arg('--icon')) query.set('icon', arg('--icon'));
if (previewDir) query.set('preview', '1');
const server = await createServer({ root, configFile: false, logLevel: 'error', server: { port: 5199 } });
await server.listen();
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(`http://localhost:5199/tools/ios-assets/render.html?${query}`);
  await page.waitForFunction(() => window.assets);
  const assets = await page.evaluate(() => window.assets);
  const png = ({ size, data }) => encodePng(size, Buffer.from(data, 'base64'));
  if (previewDir) {
    mkdirSync(previewDir, { recursive: true });
    for (const [name, img] of Object.entries(assets.previews)) writeFileSync(resolve(previewDir, `icon-${name}.png`), png(img));
    console.log(`Wrote ${Object.keys(assets.previews).length} icon concepts to ${previewDir}`);
  } else {
    writeFileSync(resolve(xc, 'AppIcon.appiconset/AppIcon-512@2x.png'), png(assets.icon));
    for (const f of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
      writeFileSync(resolve(xc, 'Splash.imageset', f), png(assets.splash));
    }
    console.log('Wrote AppIcon and Splash images');
  }
} finally {
  await browser.close();
  await server.close();
}

/** Minimal PNG encoder for 8-bit RGB (no alpha channel, as App Store icons require). */
function encodePng(size, rgb) {
  const rows = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) rgb.copy(rows, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3);
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, body) => {
    const head = Buffer.alloc(8); head.writeUInt32BE(body.length); head.write(type, 4, 'ascii');
    const tail = Buffer.alloc(4); tail.writeUInt32BE(crc(Buffer.concat([head.subarray(4), body])));
    return Buffer.concat([head, body, tail]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
