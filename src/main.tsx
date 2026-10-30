import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { getApiBaseUrl } from './utils/apiBase';

if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
  try {
    const origFetch = window.fetch.bind(window);
    const customFetch = function (input: RequestInfo | URL, init?: RequestInit) {
      if (typeof input === 'string' && input.startsWith('/api/')) {
        const base = getApiBaseUrl();
        if (base) {
          return origFetch(`${base}${input}`, init);
        }
      }
      return origFetch(input, init);
    };
    try {
      window.fetch = customFetch;
    } catch {
      Object.defineProperty(window, 'fetch', {
        value: customFetch,
        writable: true,
        configurable: true,
      });
    }
  } catch {
    // Ignore in restrictive web sandboxes
  }
}

// Standalone desktop guard: If opened inside a regular external browser (Chrome/Edge/Firefox),
// do NOT render the floating desktop overlay. Show a clean inactive service page and attempt to close the tab.
const isElectron = Boolean(
  (typeof window !== 'undefined' && (window as any).electronAPI) ||
  (typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent))
);

if (typeof window !== 'undefined' && !isElectron && window.location.protocol.startsWith('http')) {
  try {
    window.open('', '_self')?.close();
    window.close();
    window.location.replace('about:blank');
  } catch {}

  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = `
      <div style="background:#09090b;color:#a1a1aa;font-family:system-ui,-apple-system,sans-serif;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:20px;user-select:none;">
        <div style="width:44px;height:44px;border-radius:14px;background:#18181b;display:flex;align-items:center;justify-content:center;margin-bottom:14px;border:1px solid #27272a;box-shadow:0 8px 24px rgba(0,0,0,0.5);">
          <div style="width:12px;height:12px;border-radius:50%;background:#0a84ff;"></div>
        </div>
        <h2 style="color:#ffffff;font-size:16px;font-weight:600;margin:0 0 6px 0;">WinIsle Desktop Service Active</h2>
        <p style="font-size:13px;max-width:380px;line-height:1.5;margin:0 0 16px 0;color:#9ca3af;">WinIsle berjalan sebagai desktop overlay mandiri di latar belakang Windows. Halaman browser ini tidak diperlukan dan dapat ditutup.</p>
        <button onclick="window.close()" style="background:#27272a;color:#ffffff;border:1px solid #3f3f46;border-radius:8px;padding:7px 16px;font-size:12px;cursor:pointer;">Tutup Tab Ini</button>
      </div>
    `;
  }
} else {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
