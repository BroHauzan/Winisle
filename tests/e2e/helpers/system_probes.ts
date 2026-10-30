/**
 * System and workspace probes for checking repository files, binary sizes,
 * and environment capabilities.
 */

export interface FileStatResult {
  exists: boolean;
  sizeBytes: number;
  isFile: boolean;
  isDirectory: boolean;
}

export function probePath(path: string): FileStatResult {
  try {
    const stat = Deno.statSync(path);
    return {
      exists: true,
      sizeBytes: stat.size,
      isFile: stat.isFile,
      isDirectory: stat.isDirectory,
    };
  } catch {
    return {
      exists: false,
      sizeBytes: 0,
      isFile: false,
      isDirectory: false,
    };
  }
}

export function readTextFileOrNull(path: string): string | null {
  try {
    return Deno.readTextFileSync(path);
  } catch {
    return null;
  }
}

export function probeExecutableSizeMb(path: string): number {
  const stat = probePath(path);
  if (!stat.exists) return 0;
  return Number((stat.sizeBytes / (1024 * 1024)).toFixed(2));
}

export function isWindowsPlatform(): boolean {
  return Deno.build.os === 'windows';
}
