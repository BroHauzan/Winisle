/**
 * WinIsle Milestone 4 Adversarial Stress Test Suite
 * Empirical verification of TypeScript typing, frontend bundling,
 * package.json scripts, and release binary integrity.
 */

import { assert, assertEquals, assertNotEquals, assertThrows } from './helpers/assert.ts';
import { probePath, readTextFileOrNull, probeExecutableSizeMb } from './helpers/system_probes.ts';

// Replicate type contract exported from src/App.tsx
export type LyricsSyncType = 'LINE' | 'WORD' | 'synced' | 'unsynced';

export interface RealMediaTrack {
  title: string;
  artist: string;
  coverUrl?: string;
  audioUrl?: string;
  isFlac?: boolean;
  durationMs: number;
  lrc: string;
  syncType?: LyricsSyncType;
  provider?: string;
  wordsByLine?: any[];
  lrclibId?: number;
  youtubeVideoId?: string;
  youtubeMusicUrl?: string;
  spotifyUrl?: string;
  sourceType?: 'internal' | 'external';
  externalApp?: string;
  tintRgb: [number, number, number];
}

// Mimic reducer logic in src/App.tsx lines 1477-1488 and 2213-2226
function reduceTrackUpdate(
  prev: RealMediaTrack | null,
  activeTitle: string,
  data: {
    title?: string;
    artist?: string;
    lrc: string;
    syncType?: LyricsSyncType;
    provider?: string;
    wordsByLine?: any[];
    lrclibId?: number;
  }
): RealMediaTrack | null {
  if (!prev) return null;
  if (prev.title !== activeTitle) return prev;
  return {
    ...prev,
    title: data.title || prev.title,
    artist: data.artist || prev.artist,
    lrc: data.lrc,
    syncType: data.syncType,
    provider: data.provider,
    wordsByLine: data.wordsByLine,
    lrclibId: data.lrclibId,
  };
}

Deno.test('Challenger-M4-01: TypeScript lyrics syncType variants & reducer stability', () => {
  const syncTypes: (LyricsSyncType | undefined)[] = ['LINE', 'WORD', 'synced', 'unsynced', undefined];

  const initialTrack: RealMediaTrack = {
    title: 'Adversarial Track',
    artist: 'Challenger',
    durationMs: 180000,
    lrc: '',
    tintRgb: [0.5, 0.5, 0.5],
  };

  // Verify reducer correctly updates for each syncType variant
  for (const st of syncTypes) {
    const updated = reduceTrackUpdate(initialTrack, 'Adversarial Track', {
      lrc: '[00:01.00] Test line',
      syncType: st,
      provider: 'lrclib.net',
    });

    assert(updated !== null, 'Updated track must not be null');
    assertEquals(updated.syncType, st, `syncType must match ${st}`);
    assertEquals(updated.lrc, '[00:01.00] Test line');
    assertEquals(updated.title, 'Adversarial Track');
  }

  // Reducer with null prev
  const nullUpdated = reduceTrackUpdate(null, 'Adversarial Track', {
    lrc: '[00:01.00] Line',
    syncType: 'LINE',
  });
  assertEquals(nullUpdated, null, 'Reducer on null prev must remain null');

  // Reducer with title mismatch (stale async response)
  const staleUpdated = reduceTrackUpdate(initialTrack, 'Different Track Title', {
    lrc: '[00:01.00] Stale Line',
    syncType: 'LINE',
  });
  assert(staleUpdated !== null);
  assertEquals(staleUpdated, initialTrack, 'Reducer on title mismatch must return unchanged prev');
  assertEquals(staleUpdated.lrc, '', 'Stale update must not overwrite lrc');
});

Deno.test('Challenger-M4-02: Stress-test rapid 1,000-cycle syncType mutations & state consistency', () => {
  let current: RealMediaTrack | null = {
    title: 'Stress Track',
    artist: 'Stress Artist',
    durationMs: 240000,
    lrc: '',
    syncType: undefined,
    tintRgb: [0.1, 0.2, 0.3],
  };

  const syncSequence: (LyricsSyncType | undefined)[] = ['LINE', 'WORD', 'synced', 'unsynced', undefined];

  for (let i = 0; i < 1000; i++) {
    const nextSync = syncSequence[i % syncSequence.length];
    current = reduceTrackUpdate(current, 'Stress Track', {
      lrc: `[00:${(i % 60).toString().padStart(2, '0')}.00] Line ${i}`,
      syncType: nextSync,
      wordsByLine: [{ word: `W${i}`, time: i * 100 }],
      lrclibId: i,
    });
    assert(current !== null);
    assertEquals(current.syncType, nextSync);
    assertEquals(current.lrclibId, i);
  }

  assertEquals(current?.lrclibId, 999);
  assertEquals(current?.syncType, syncSequence[999 % syncSequence.length]);
});

Deno.test('Challenger-M4-03: Edge case payloads in lyrics state (extreme sizes & unicode)', () => {
  const baseTrack: RealMediaTrack = {
    title: 'Edge Lyrics Track',
    artist: 'Unicode Band 🎧',
    durationMs: 3600000,
    lrc: '',
    tintRgb: [0.9, 0.1, 0.5],
  };

  // 1. Enormous 10,000 line LRC string (~350 KB payload)
  let hugeLrc = '';
  for (let i = 0; i < 10000; i++) {
    hugeLrc += `[${Math.floor(i / 60)}:${(i % 60).toString().padStart(2, '0')}.00] ♫ Line ${i} testing lyrics buffer ♫\n`;
  }

  const hugeUpdated = reduceTrackUpdate(baseTrack, 'Edge Lyrics Track', {
    lrc: hugeLrc,
    syncType: 'LINE',
    provider: 'embedded-stress',
  });
  assert(hugeUpdated !== null);
  assertEquals(hugeUpdated.syncType, 'LINE');
  assertEquals(hugeUpdated.lrc.length, hugeLrc.length);

  // 2. Multilingual & RTL unicode lyrics
  const unicodeLrc = '[00:01.00] こんにちは 世界\n[00:03.00] مرحبا بالعالم\n[00:05.00] Привет мир\n[00:07.00] 🌟✨🔥';
  const unicodeUpdated = reduceTrackUpdate(baseTrack, 'Edge Lyrics Track', {
    lrc: unicodeLrc,
    syncType: 'WORD',
    provider: 'lrclib.net',
  });
  assert(unicodeUpdated !== null);
  assertEquals(unicodeUpdated.syncType, 'WORD');
  assertEquals(unicodeUpdated.lrc, unicodeLrc);
});

Deno.test('Challenger-M4-04: Frontend production bundle (dist/) integrity & size envelope', () => {
  const distStat = probePath('dist');
  assert(distStat.exists && distStat.isDirectory, 'dist/ directory must exist');

  const htmlStat = probePath('dist/index.html');
  assert(htmlStat.exists && htmlStat.isFile, 'dist/index.html must exist');
  assert(htmlStat.sizeBytes < 5000, `dist/index.html size (${htmlStat.sizeBytes} B) must be < 5 kB`);

  const htmlContent = readTextFileOrNull('dist/index.html') || '';
  assert(htmlContent.toLowerCase().includes('<!doctype html>'), 'index.html must have valid HTML5 doctype');
  assert(htmlContent.includes('assets/index-'), 'index.html must link to hashed assets');

  // Find JS and CSS assets
  let jsCount = 0;
  let cssCount = 0;
  let totalAssetBytes = 0;

  for (const entry of Deno.readDirSync('dist/assets')) {
    const entryPath = `dist/assets/${entry.name}`;
    const stat = probePath(entryPath);
    if (stat.isFile) {
      totalAssetBytes += stat.sizeBytes;
      if (entry.name.endsWith('.js')) {
        jsCount++;
        // JS bundle should be within ~400-500 kB uncompressed
        assert(stat.sizeBytes < 1024 * 1024, `JS chunk ${entry.name} (${stat.sizeBytes} B) exceeds 1 MB limit`);
        const jsContent = readTextFileOrNull(entryPath) || '';
        assert(!jsContent.includes('electron/'), `JS chunk ${entry.name} must not contain electron/ references`);
        assert(!jsContent.includes('dist-server'), `JS chunk ${entry.name} must not contain dist-server references`);
        assert(!jsContent.includes('require("electron")'), `JS chunk must not contain electron require`);
      } else if (entry.name.endsWith('.css')) {
        cssCount++;
        // CSS bundle should be within ~50-80 kB
        assert(stat.sizeBytes < 150 * 1024, `CSS chunk ${entry.name} (${stat.sizeBytes} B) exceeds 150 kB limit`);
      }
    }
  }

  assert(jsCount >= 1, 'Must have at least one JS bundle in dist/assets');
  assert(cssCount >= 1, 'Must have at least one CSS bundle in dist/assets');
  assert(totalAssetBytes < 2 * 1024 * 1024, `Total dist assets (${totalAssetBytes} B) must be under 2 MB ceiling`);
});

Deno.test('Challenger-M4-05: package.json script specification & legacy dependency purge', () => {
  const pkgContent = readTextFileOrNull('package.json');
  assert(pkgContent !== null, 'package.json must exist');

  const pkg = JSON.parse(pkgContent);

  // Script contracts
  assertEquals(pkg.scripts?.dev, 'vite', 'npm run dev must run vite');
  assertEquals(pkg.scripts?.build, 'vite build', 'npm run build must run vite build');
  assertEquals(pkg.scripts?.preview, 'vite preview', 'npm run preview must run vite preview');
  assertEquals(pkg.scripts?.lint, 'tsc --noEmit', 'npm run lint must run tsc --noEmit');
  assert(pkg.scripts?.tauri?.includes('@tauri-apps/cli'), 'tauri script must invoke tauri CLI');
  assert(pkg.scripts?.['tauri:build']?.includes('@tauri-apps/cli build'), 'tauri:build script must invoke tauri CLI build');

  // Absence of obsolete scripts
  assertEquals(pkg.scripts?.['build:server'], undefined, 'build:server must be removed');
  assertEquals(pkg.scripts?.['electron:dev'], undefined, 'electron:dev must be removed');
  assertEquals(pkg.scripts?.['build:exe'], undefined, 'build:exe must be removed');
  assertEquals(pkg.scripts?.dist, undefined, 'dist script must be removed');
  assertEquals(pkg.scripts?.start, undefined, 'start script must be removed');

  // Absence of electron-builder NSIS config block
  assertEquals(pkg.build, undefined, 'electron-builder build config must be removed');
  assertEquals(pkg.main, undefined, 'main entry point to electron must be removed');

  // Absence of deprecated dependencies
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  assertEquals(allDeps['electron'], undefined, 'electron must be pruned');
  assertEquals(allDeps['electron-builder'], undefined, 'electron-builder must be pruned');
  assertEquals(allDeps['express'], undefined, 'express must be pruned');
  assertEquals(allDeps['@types/express'], undefined, 'types/express must be pruned');
  assertEquals(allDeps['ws'], undefined, 'ws must be pruned');
  assertEquals(allDeps['@types/ws'], undefined, 'types/ws must be pruned');
  assertEquals(allDeps['tsx'], undefined, 'tsx must be pruned');
  assertEquals(allDeps['esbuild'], undefined, 'esbuild must be pruned');
});

Deno.test('Challenger-M4-06: Production binary PE32+ header and size validation', () => {
  const binaryPath = 'src-tauri/target/release/winisle.exe';
  const sizeMb = probeExecutableSizeMb(binaryPath);
  assert(sizeMb > 0, `Release binary must exist at ${binaryPath}`);
  assert(sizeMb >= 2.0 && sizeMb <= 10.0, `Binary size (${sizeMb} MB) must be within [2.0, 10.0] MB target bounds`);

  // Verify MZ DOS stub / PE executable header
  const fileBytes = Deno.readFileSync(binaryPath);
  assert(fileBytes.length > 512, 'Binary must be at least 512 bytes');
  // Byte 0: 0x4D ('M'), Byte 1: 0x5A ('Z')
  assertEquals(fileBytes[0], 0x4D, 'PE header byte 0 must be 0x4D (M)');
  assertEquals(fileBytes[1], 0x5A, 'PE header byte 1 must be 0x5A (Z)');
});
