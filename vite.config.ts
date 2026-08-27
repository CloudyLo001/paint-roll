import { readdir, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { defineConfig, type Plugin, type ResolvedConfig } from 'vite';

/**
 * Relative base so the same build works from a file path, a sub-path on GitHub
 * Pages, and the dev server without baking a repository name in.
 */
const devPort = Number(process.env.PORT ?? 5191);
const previewPort = Number(process.env.PORT ?? 4191);
const portWasAssigned = Boolean(process.env.PORT);

/**
 * Mint artifacts the runtime never fetches.
 *
 * The registry deliberately records everything Mint produced, but the game only
 * loads the four PBR maps and the GLB. The map archives and preview images are
 * over half the deployed payload, which is worth caring about on Pages.
 *
 * Deliberately a denylist, not an allowlist: a newly generated material's maps
 * are kept automatically, so the worst case of getting this list wrong is a
 * larger build rather than a broken one.
 */
const PRUNED_ARTIFACTS = new Set([
  'maps_zip.zip',
  'preview_image.png',
  'preview_image.webp',
  'map_height.png',
]);

function pruneUnusedMintArtifacts(): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'prune-unused-mint-artifacts',
    apply: 'build',
    configResolved(resolved) {
      config = resolved;
    },
    async closeBundle() {
      const root = resolve(config.root, config.build.outDir, 'assets/mint');
      let removed = 0;
      let bytes = 0;

      let assetDirs: string[];
      try {
        assetDirs = await readdir(root);
      } catch {
        return; // No synchronized Mint assets in this build.
      }

      for (const assetDir of assetDirs) {
        const dir = join(root, assetDir);
        let files: string[];
        try {
          files = await readdir(dir);
        } catch {
          continue;
        }
        for (const file of files) {
          if (!PRUNED_ARTIFACTS.has(file)) continue;
          const path = join(dir, file);
          bytes += (await stat(path)).size;
          await rm(path);
          removed += 1;
        }
      }

      if (removed > 0) {
        config.logger.info(
          `pruned ${removed} unused Mint artifacts (${(bytes / 1_048_576).toFixed(1)} MB)`,
        );
      }
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [pruneUnusedMintArtifacts()],
  server: {
    host: '127.0.0.1',
    port: devPort,
    strictPort: portWasAssigned,
  },
  preview: {
    host: '127.0.0.1',
    port: previewPort,
    strictPort: portWasAssigned,
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
});
