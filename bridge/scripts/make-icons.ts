// Draws the app icon and the three tray icons from the SVG sources in build/. Run from bridge/: npm run icons
// Writes build/icon.png (512, for electron-builder, which turns it into the .ico), renderer/icon.png (256, for the windows) and assets/tray-*.png (32).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const root = join(__dirname, '..');
const png = (svg: string, size: number): Buffer => Buffer.from(new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng());

// A dot, a half-filled dot and a cross: the three states differ by shape as well as colour.
const BADGES = {
  connected: '<circle cx="24.5" cy="24.5" r="6" fill="#4ade80"/>',
  partly: '<circle cx="24.5" cy="24.5" r="5.1" fill="#0a0f21" stroke="#fbbf24" stroke-width="1.8"/><path d="M24.5 19.4 A5.1 5.1 0 0 0 24.5 29.6 Z" fill="#fbbf24"/>',
  offline: '<circle cx="24.5" cy="24.5" r="6" fill="#ee3b3b"/><path d="M21.8 21.8 L27.2 27.2 M27.2 21.8 L21.8 27.2" stroke="#fff" stroke-width="1.9" stroke-linecap="round"/>',
};

const icon = readFileSync(join(root, 'build', 'icon.svg'), 'utf8');
writeFileSync(join(root, 'build', 'icon.png'), png(icon, 512));
writeFileSync(join(root, 'renderer', 'icon.png'), png(icon, 256));

const tray = readFileSync(join(root, 'build', 'tray.svg'), 'utf8');
for (const [level, badge] of Object.entries(BADGES)) writeFileSync(join(root, 'assets', `tray-${level}.png`), png(tray.replace('{{BADGE}}', badge), 32));
console.log('Icons written');
