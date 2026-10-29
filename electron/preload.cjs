const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  /**
   * Toggle click-through on transparent areas outside the Dynamic Island pill.
   * When ignore === true, { forward: true } forwards mousemove events so the renderer
   * detects when the cursor enters the Dynamic Island again.
   */
  setIgnoreMouseEvents: (ignore, options) => {
    ipcRenderer.send('set-ignore-mouse-events', Boolean(ignore), options || { forward: true });
  },
  getServerUrl: () => {
    try {
      return ipcRenderer.sendSync('get-server-url') || 'http://127.0.0.1:45781';
    } catch {
      return 'http://127.0.0.1:45781';
    }
  },
  /**
   * Subscribe to global Alt+Q / Alt+I shortcut events dispatched from the Electron main process.
   */
  onToggleAssistant: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = () => callback();
    ipcRenderer.on('toggle-isle-assistant', handler);
    return () => {
      ipcRenderer.removeListener('toggle-isle-assistant', handler);
    };
  },
});
