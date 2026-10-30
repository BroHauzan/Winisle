export interface ParsedMusicQuery {
  searchQuery: string;
  detectedArtist?: string;
  descriptiveType?: 'popular' | 'latest' | 'best' | 'mood' | 'general';
  displayName: string;
  isDescriptive: boolean;
}

/**
 * Checks whether a text contains raw descriptive prompt phrases rather than a real song title.
 */
export function hasDescriptiveKeywords(text: string): boolean {
  if (!text) return false;
  return /\b(?:yang\s+populer|paling\s+populer|terpopuler|populer\s+oleh|populer\s+dari|terbaru\s+dari|terbaru\s+oleh|terbaik\s+dari|terbaik\s+oleh|lagu\s+hits|musik\s+hits|lagu\s+terpopuler|musik\s+terpopuler|lagu\s+populer|musik\s+populer|oleh\s+[a-zA-Z0-9_-]+|dari\s+[a-zA-Z0-9_-]+)\b/i.test(
    text
  );
}

/**
 * Parses user input for music requests and extracts artist and intent from descriptive phrases.
 * Examples:
 * - "yang populer oleh alan walker" -> detectedArtist: "Alan Walker", searchQuery: "Alan Walker"
 * - "lagu terbaru dari tulus" -> detectedArtist: "Tulus", searchQuery: "Tulus", descriptiveType: "latest"
 * - "faded alan walker" -> searchQuery: "faded alan walker", isDescriptive: false
 */
export function parseMusicQuery(raw: string): ParsedMusicQuery {
  let q = (raw || '').trim();

  // Strip leading speech / polite command prefixes
  q = q.replace(/^(?:tolong\s+)?(?:puterin|putarkan|putar|puter|setel|stel|mainkan|play)\s+/i, '');
  q = q.replace(/^(?:lagu|musik|music|song|track)\s+/i, '');
  q = q.trim();

  // Determine descriptive preference
  let descriptiveType: 'popular' | 'latest' | 'best' | 'mood' | 'general' = 'general';
  if (/\b(?:populer|terpopuler|terkenal|viral|hits?|top|favorit|terfavorit)\b/i.test(q)) {
    descriptiveType = 'popular';
  } else if (/\b(?:terbaru|latest|newest|baru)\b/i.test(q)) {
    descriptiveType = 'latest';
  } else if (/\b(?:terbaik|best|greatest)\b/i.test(q)) {
    descriptiveType = 'best';
  }

  // Helper to capitalize words in artist name nicely
  const formatName = (str: string) =>
    str
      .trim()
      .split(/\s+/)
      .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ''))
      .join(' ');

  // 1. Pattern: (yang) (paling) (populer|terbaru|terbaik|hits) oleh/dari/milik/by <artist>
  // e.g. "yang populer oleh alan walker", "terbaru dari tulus", "hits by coldplay"
  let m = q.match(
    /^(?:yang\s+)?(?:paling\s+)?(?:populer|terpopuler|terkenal|hits?|terbaik|terbaru|terfavorit|viral|favorit|enak|santai|top|best)\s+(?:dari|oleh|milik|ciptaan|nyanyian|punya|by|of)\s+(.+)/i
  );
  if (m && m[1]) {
    const rawArtist = m[1].replace(/^(?:artis|penyanyi|band)\s+/i, '').trim();
    const artist = formatName(rawArtist);
    return {
      searchQuery: artist,
      detectedArtist: artist,
      descriptiveType,
      displayName: artist,
      isDescriptive: true,
    };
  }

  // 2. Pattern: dari/oleh/milik/by <artist> (yang) (paling) (populer|terbaru|terbaik|hits)
  // e.g. "oleh alan walker yang populer", "dari tulus yang terbaru"
  m = q.match(
    /^(?:dari|oleh|milik|ciptaan|by)\s+(.+?)\s+(?:yang\s+)?(?:paling\s+)?(?:populer|terpopuler|terkenal|hits?|terbaik|terbaru|terfavorit|viral|favorit|enak|santai|top|best)$/i
  );
  if (m && m[1]) {
    const rawArtist = m[1].replace(/^(?:artis|penyanyi|band)\s+/i, '').trim();
    const artist = formatName(rawArtist);
    return {
      searchQuery: artist,
      detectedArtist: artist,
      descriptiveType,
      displayName: artist,
      isDescriptive: true,
    };
  }

  // 3. Pattern: <artist> (yang) (paling) (populer|terbaru|terbaik|hits)
  // e.g. "alan walker yang populer", "alan walker hits", "tulus terbaru"
  m = q.match(
    /^(.+?)\s+(?:yang\s+)?(?:paling\s+)?(?:populer|terpopuler|terkenal|hits?|terbaik|terbaru|terfavorit|viral|favorit|enak|santai|top|best)$/i
  );
  if (m && m[1]) {
    const rawArtist = m[1].replace(/^(?:lagu|musik)\s+/i, '').trim();
    if (!/^(?:yang|lagu|musik|apa)$/i.test(rawArtist)) {
      const artist = formatName(rawArtist);
      return {
        searchQuery: artist,
        detectedArtist: artist,
        descriptiveType,
        displayName: artist,
        isDescriptive: true,
      };
    }
  }

  // 4. Pattern: dari/oleh/milik/by <artist>
  // e.g. "dari alan walker", "oleh coldplay"
  m = q.match(/^(?:dari|oleh|milik|by)\s+(.+)/i);
  if (m && m[1]) {
    const rawArtist = m[1].replace(/^(?:artis|penyanyi|band)\s+/i, '').trim();
    const artist = formatName(rawArtist);
    return {
      searchQuery: artist,
      detectedArtist: artist,
      descriptiveType,
      displayName: artist,
      isDescriptive: true,
    };
  }

  // 5. Pattern: (yang) (paling) (populer|terbaru|terbaik|hits) <artist>
  // e.g. "hits alan walker", "terpopuler tulus", "lagu terbaik coldplay"
  m = q.match(
    /^(?:yang\s+)?(?:paling\s+)?(?:populer|terpopuler|terkenal|hits?|terbaik|terbaru|terfavorit|viral|favorit|enak|top|best)\s+(.+)/i
  );
  if (m && m[1]) {
    const rawArtist = m[1].replace(/^(?:artis|penyanyi|band)\s+/i, '').trim();
    const artist = formatName(rawArtist);
    return {
      searchQuery: artist,
      detectedArtist: artist,
      descriptiveType,
      displayName: artist,
      isDescriptive: true,
    };
  }

  // If query is solely descriptive without an artist specified
  if (
    /^(?:yang\s+)?(?:paling\s+)?(?:populer|terpopuler|terkenal|hits?|terbaik|terbaru|terfavorit|viral|favorit|enak|santai)$/i.test(
      q
    )
  ) {
    return {
      searchQuery: 'Top Hits Indonesia',
      descriptiveType: 'popular',
      displayName: 'Top Hits',
      isDescriptive: true,
    };
  }

  // Standard specific song query (e.g., "Faded", "Lily Alan Walker", "Hanya Rindu")
  return {
    searchQuery: q,
    displayName: q,
    isDescriptive: false,
  };
}
