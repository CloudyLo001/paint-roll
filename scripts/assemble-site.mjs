/**
 * Assembles the deployed site.
 *
 *   _site/        the landing page (site/)
 *   _site/play/   the game (dist/)
 *
 * Kept as a script rather than inline shell so the local preview and CI build
 * the exact same tree — a landing page whose Play button 404s in production but
 * works locally is the failure worth engineering against.
 */
import { cp, mkdir, rm, readdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, '_site');
const landing = join(root, 'site');
const game = join(root, 'dist');

async function requireDir(path, hint) {
  try {
    if ((await stat(path)).isDirectory()) return;
  } catch {
    /* fall through */
  }
  throw new Error(`Missing ${path}. ${hint}`);
}

async function totalSize(dir) {
  let bytes = 0;
  let files = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await totalSize(path);
      bytes += nested.bytes;
      files += nested.files;
    } else {
      bytes += (await stat(path)).size;
      files += 1;
    }
  }
  return { bytes, files };
}

await requireDir(landing, 'The landing page source should live in site/.');
await requireDir(game, 'Run `npm run build` first.');

// Windows holds transient locks on a tree that was just served or scanned, so
// a couple of retries avoids a spurious ENOTEMPTY.
await rm(out, { recursive: true, force: true, maxRetries: 4, retryDelay: 150 });
await mkdir(out, { recursive: true });

await cp(landing, out, { recursive: true });
await cp(game, join(out, 'play'), { recursive: true });

const { bytes, files } = await totalSize(out);
console.log(
  `assembled _site: landing page at /, game at /play/ — ${files} files, ${(bytes / 1_048_576).toFixed(1)} MB`,
);
