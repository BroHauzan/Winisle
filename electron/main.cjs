const { app, BrowserWindow, screen, ipcMain, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');

const PORT = Number(process.env.PORT) || 3000;
const SERVER_URL = `http://127.0.0.1:${PORT}`;

// Window dimensions large enough to fit the largest expanded Dynamic Island state (Lyrics mode 650px + shoulders)
// while keeping the rest of the window 100% transparent and click-through.
const OVERLAY_WIDTH = 740;
const OVERLAY_HEIGHT = 340;

let mainWindow = null;
let devServerProcess = null;
let embeddedServerInstance = null;

// Prevent multiple instances of the Dynamic Island overlay
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

/**
 * Check if local server on PORT is already responding
 */
function isServerAlive() {
  return new Promise((resolve) => {
    const req = http.get(`${SERVER_URL}/api/system/hardware`, { timeout: 900 }, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Wait until the local backend server is ready before showing the overlay
 */
async function waitForServerReady(maxWaitMs = 12000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    if (await isServerAlive()) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

/**
 * Automatically start the local backend (server.ts / dist-server/server.cjs) inside the Electron lifecycle
 */
async function ensureLocalBackendRunning() {
  if (await isServerAlive()) {
    return;
  }

  const distDir = path.join(__dirname, '..', 'dist');
  const bundledServerPath = path.join(__dirname, '..', 'dist-server', 'server.cjs');

  process.env.PORT = String(PORT);
  process.env.ISLE_MANUAL_START = '1';

  // 1. Prefer bundled CommonJS server (used in packaged Setup.exe and production builds)
  if (fs.existsSync(bundledServerPath)) {
    try {
      process.env.NODE_ENV = 'production';
      process.env.ISLE_ELECTRON_STATIC = '1';
      process.env.ISLE_DIST_DIR = distDir;
      const serverMod = require(bundledServerPath);
      if (typeof serverMod.startServer === 'function') {
        embeddedServerInstance = await serverMod.startServer(PORT);
        return;
      }
    } catch (err) {
      console.error('Failed to start bundled server in-process:', err);
    }
  }

  // 2. Fallback for development (`electron .` without running `npm run build:server` first)
  const rootDir = path.join(__dirname, '..');
  const tsxBin = path.join(
    rootDir,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'tsx.cmd' : 'tsx'
  );
  const cmd = fs.existsSync(tsxBin) ? tsxBin : 'npx';
  const args = fs.existsSync(tsxBin) ? ['server.ts'] : ['tsx', 'server.ts'];

  devServerProcess = spawn(cmd, args, {
    cwd: rootDir,
    env: {
      ...process.env,
      PORT: String(PORT),
      ISLE_MANUAL_START: '0',
    },
    stdio: 'ignore',
    windowsHide: true,
    shell: process.platform === 'win32',
  });

  await waitForServerReady(12000);
}

/**
 * Position the window flush at top: 0 and horizontally centered on the primary display
 */
function positionWindowTopCenter(win) {
  if (!win || win.isDestroyed()) return;
  const primaryDisplay = screen.getPrimaryDisplay();
  const { x: displayX, y: displayY, width: displayWidth } = primaryDisplay.bounds;
  const targetX = Math.round(displayX + (displayWidth - OVERLAY_WIDTH) / 2);
  const targetY = displayY; // top: 0 of primary display
  win.setBounds({
    x: targetX,
    y: targetY,
    width: OVERLAY_WIDTH,
    height: OVERLAY_HEIGHT,
  });
}

function createOverlayWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { x: displayX, y: displayY, width: displayWidth } = primaryDisplay.bounds;
  const initialX = Math.round(displayX + (displayWidth - OVERLAY_WIDTH) / 2);
  const initialY = displayY; // top: 0

  mainWindow = new BrowserWindow({
    width: OVERLAY_WIDTH,
    height: OVERLAY_HEIGHT,
    x: initialX,
    y: initialY,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  // Keep overlay above taskbar and fullscreen windows ('screen-saver' level)
  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Enable click-through on transparent areas by default while forwarding mousemove events
  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  mainWindow.loadURL(SERVER_URL);

  // Re-center if monitor resolution or display scaling changes
  const handleDisplayChange = () => positionWindowTopCenter(mainWindow);
  screen.on('display-metrics-changed', handleDisplayChange);
  screen.on('display-added', handleDisplayChange);
  screen.on('display-removed', handleDisplayChange);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC handler for dynamic click-through toggling from renderer
ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) return;
  if (ignore) {
    win.setIgnoreMouseEvents(true, options || { forward: true });
  } else {
    win.setIgnoreMouseEvents(false);
  }
});

app.whenReady().then(async () => {
  // Configure automatic launch at Windows startup when packaged
  if (app.isPackaged && process.platform === 'win32') {
    try {
      app.setLoginItemSettings({
        openAtLogin: true,
        path: process.execPath,
      });
    } catch {
      // ignore
    }
  }

  await ensureLocalBackendRunning();
  createOverlayWindow();

  // Register global Alt+Q shortcut so user can summon Isle Assistant even over fullscreen games/apps
  try {
    globalShortcut.register('Alt+Q', () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      mainWindow.setIgnoreMouseEvents(false);
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send('toggle-isle-assistant');
    });
  } catch {
    // ignore shortcut registration errors
  }
});

app.on('second-instance', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    positionWindowTopCenter(mainWindow);
    mainWindow.show();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (embeddedServerInstance && typeof embeddedServerInstance.close === 'function') {
    try {
      embeddedServerInstance.close();
    } catch {
      // ignore
    }
  }
  if (devServerProcess) {
    try {
      devServerProcess.kill();
    } catch {
      // ignore
    }
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
