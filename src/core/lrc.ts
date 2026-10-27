// Ported from crates/isle-core/src/lrc.rs

export interface LyricLine {
  timeMs: number;
  text: string;
}

function parseTimestamp(tag: string): number | null {
  const colonIdx = tag.indexOf(':');
  if (colonIdx === -1) return null;
  const minStr = tag.slice(0, colonIdx);
  const secStr = tag.slice(colonIdx + 1);
  if (!/^\d+$/.test(minStr)) return null;
  const minutes = parseInt(minStr, 10);
  if (minutes < 0 || minutes > 9999) return null;

  let wholeStr = secStr;
  let fracStr = '';
  const dotIdx = secStr.search(/[.:]/);
  if (dotIdx !== -1) {
    wholeStr = secStr.slice(0, dotIdx);
    fracStr = secStr.slice(dotIdx + 1);
  }
  if (!/^\d+$/.test(wholeStr)) return null;
  const whole = parseInt(wholeStr, 10);
  if (whole < 0 || whole >= 60) return null;
  if (fracStr.length > 0 && !/^\d+$/.test(fracStr)) return null;

  let fractionMs = 0;
  if (fracStr.length === 1) fractionMs = parseInt(fracStr, 10) * 100;
  else if (fracStr.length === 2) fractionMs = parseInt(fracStr, 10) * 10;
  else if (fracStr.length >= 3) fractionMs = parseInt(fracStr.slice(0, 3), 10);

  return minutes * 60_000 + whole * 1000 + fractionMs;
}

export function parseLrc(source: string): LyricLine[] {
  let offsetMs = 0;
  const lines: LyricLine[] = [];

  for (const raw of source.split('\n')) {
    let rest = raw.trim();
    const times: number[] = [];

    while (rest.startsWith('[')) {
      const endIdx = rest.indexOf(']');
      if (endIdx === -1) break;
      const tag = rest.slice(1, endIdx);
      const time = parseTimestamp(tag);
      if (time !== null) {
        times.push(time);
      } else if (tag.startsWith('offset:')) {
        const parsedOffset = parseInt(tag.slice(7).trim(), 10);
        if (!Number.isNaN(parsedOffset)) offsetMs = parsedOffset;
      }
      rest = rest.slice(endIdx + 1).trimStart();
    }

    const text = rest.trim();
    for (const t of times) {
      lines.push({
        timeMs: Math.max(0, t - offsetMs),
        text,
      });
    }
  }

  lines.sort((a, b) => a.timeMs - b.timeMs);
  return lines;
}

export interface TrackItem {
  id: string;
  title: string;
  artist: string;
  album: string;
  app: 'Spotify' | 'YouTube Music' | 'Rhythmbox';
  durationMs: number;
  coverGradient: [string, string, string];
  tintRgb: [number, number, number];
  lrc: string;
}

export const SAMPLE_TRACKS: TrackItem[] = [
  {
    id: 'midnight-city-lights',
    title: 'Midnight Analog',
    artist: 'Kiasmos & Olafur',
    album: 'Blurred Horizons',
    app: 'Spotify',
    durationMs: 48_000,
    coverGradient: ['#1a2a6c', '#b21f1f', '#fdbb2d'],
    tintRgb: [0.22, 0.48, 0.95],
    lrc: `[00:00.00]
[00:03.00]Walking through the glass top bezel
[00:07.50]Every pixel settles on the frame clock
[00:12.00]Wait for the spring to catch the light
[00:16.50]
[00:19.50]Soft shadows under neon rain
[00:24.00]Nothing polls while the city sleeps
[00:28.50]Sing along in synced time
[00:33.00]Waking only when the next line starts
[00:38.00]Breathing dots between the verses
[00:43.00]Fading into quiet midnight`,
  },
  {
    id: 'northern-auroras',
    title: 'Subpixel Drift',
    artist: 'Tycho & Nils Frahm',
    album: 'Wayland Sessions',
    app: 'Spotify',
    durationMs: 45_000,
    coverGradient: ['#0f766e', '#0ea5e9', '#6366f1'],
    tintRgb: [0.18, 0.78, 0.68],
    lrc: `[00:00.00]Drifting past the concave shoulder
[00:05.00]Sixty hertz without a dropped frame
[00:10.00]Light rises from the bottom edge
[00:15.00]
[00:18.50]Across the workspace in a single swipe
[00:23.50]Hold the pointer still to peek inside
[00:29.00]Warm synth waves over dark obsidian
[00:35.00]Settled by five hundred milliseconds
[00:40.00]Until the music rests again`,
  },
  {
    id: 'velvet-espresso',
    title: 'Jakarta After Hours',
    artist: 'Sore & White Shoes',
    album: 'Menteng Archives',
    app: 'YouTube Music',
    durationMs: 42_000,
    coverGradient: ['#9a3412', '#d97706', '#f59e0b'],
    tintRgb: [0.95, 0.52, 0.2],
    lrc: `[00:00.00]Lampu jalan mulai redup di sudut kota
[00:05.50]Nada pelan menemani malam panjang
[00:11.00]Buka pulau kecil di atas layar
[00:16.50]Semua rapi tanpa gangguan
[00:22.00]
[00:25.50]Kopi hangat dan daftar pengingat
[00:31.00]Satu ketukan untuk mulai fokus
[00:36.50]Sampai pagi menyapa kembali`,
  },
];
