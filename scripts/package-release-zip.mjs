import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const releaseDir = path.join(rootDir, 'release');

const exeName = 'WinIsleSetup.exe';
const zipName = 'WinIsleSetup.zip';
const exePath = path.join(releaseDir, exeName);
const zipPath = path.join(releaseDir, zipName);

if (!fs.existsSync(exePath)) {
  console.error(`Error: ${exePath} tidak ditemukan. Pastikan electron-builder berhasil dijalankan.`);
  process.exit(1);
}

if (fs.existsSync(zipPath)) {
  fs.unlinkSync(zipPath);
}

console.log(`Mengemas ${exeName} ke dalam ${zipName}...`);

try {
  if (process.platform === 'win32') {
    execSync(
      `powershell -NoProfile -Command "Compress-Archive -Path '${exePath}' -DestinationPath '${zipPath}' -Force"`,
      { stdio: 'inherit' }
    );
  } else {
    execSync(`zip -j "${zipPath}" "${exePath}"`, { stdio: 'inherit' });
  }
  console.log(`Berhasil! File siap di-upload ke GitHub Releases:`);
  console.log(`  -> release/${exeName}`);
  console.log(`  -> release/${zipName} (berisi ${exeName} ketika diekstrak)`);
} catch (err) {
  console.error('Gagal membuat file ZIP:', err);
  process.exit(1);
}
