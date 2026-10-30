using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Management;

namespace WinIsleHardware {
    [StructLayout(LayoutKind.Sequential)]
    public struct SYSTEM_POWER_STATUS {
        public byte ACLineStatus;
        public byte BatteryFlag;
        public byte BatteryLifePercent;
        public byte SystemStatusFlag;
        public int BatteryLifeTime;
        public int BatteryFullLifeTime;
    }

    [Guid("657804FA-D6AD-4496-8560-52D5D48013A1"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IAudioEndpointVolumeCallback {
        int OnNotify(IntPtr pNotify);
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct AUDIO_VOLUME_NOTIFICATION_DATA {
        public Guid guidEventContext;
        [MarshalAs(UnmanagedType.Bool)]
        public bool bMuted;
        public float fMasterVolume;
        public uint nChannels;
    }

    [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IAudioEndpointVolume {
        int RegisterControlChangeNotify(IAudioEndpointVolumeCallback pNotify);
        int UnregisterControlChangeNotify(IAudioEndpointVolumeCallback pNotify);
        int GetChannelCount(out int pnChannelCount);
        int SetMasterVolumeLevel(float fLevelDB, [In] ref Guid pguidEventContext);
        int SetMasterVolumeLevelScalar(float fLevel, [In] ref Guid pguidEventContext);
        int GetMasterVolumeLevel(out float pfLevelDB);
        int GetMasterVolumeLevelScalar(out float pfLevel);
        int SetChannelVolumeLevel(uint nChannel, float fLevelDB, [In] ref Guid pguidEventContext);
        int SetChannelVolumeLevelScalar(uint nChannel, float fLevel, [In] ref Guid pguidEventContext);
        int GetChannelVolumeLevel(uint nChannel, out float pfLevelDB);
        int GetChannelVolumeLevelScalar(uint nChannel, out float pfLevel);
        int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, [In] ref Guid pguidEventContext);
        int GetMute(out bool pbMute);
    }

    [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IMMDevice {
        int Activate(ref Guid id, int clsCtx, int activationParams, out IAudioEndpointVolume aev);
    }

    [Guid("7991EEC9-7ED8-43A5-83CE-6202026EC119"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IMMNotificationClient {
        void OnDeviceStateChanged([MarshalAs(UnmanagedType.LPWStr)] string pwstrDeviceId, int dwNewState);
        void OnDeviceAdded([MarshalAs(UnmanagedType.LPWStr)] string pwstrDeviceId);
        void OnDeviceRemoved([MarshalAs(UnmanagedType.LPWStr)] string pwstrDeviceId);
        void OnDefaultDeviceChanged(int flow, int role, [MarshalAs(UnmanagedType.LPWStr)] string pwstrDefaultDeviceId);
        void OnPropertyValueChanged([MarshalAs(UnmanagedType.LPWStr)] string pwstrDeviceId, IntPtr key);
    }

    [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IMMDeviceEnumerator {
        int EnumAudioEndpoints(int dataFlow, int dwStateMask, out IntPtr ppDevices);
        int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
        int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string pwstrId, out IMMDevice endpoint);
        int RegisterEndpointNotificationCallback(IMMNotificationClient pClient);
        int UnregisterEndpointNotificationCallback(IMMNotificationClient pClient);
    }

    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    public class MMDeviceEnumeratorComObject { }

    class VolumeCallbackHandler : IAudioEndpointVolumeCallback {
        public int OnNotify(IntPtr pNotify) {
            try {
                var data = (AUDIO_VOLUME_NOTIFICATION_DATA)Marshal.PtrToStructure(pNotify, typeof(AUDIO_VOLUME_NOTIFICATION_DATA));
                int vol = (int)Math.Round(data.fMasterVolume * 100.0f);
                bool isSelf = data.guidEventContext.Equals(Program.WinIsleContextGuid);
                Program.SafeWriteLine(string.Format("{{\"event\":\"volume_changed\",\"volume\":{0},\"muted\":{1},\"isSelf\":{2}}}", vol, data.bMuted ? "true" : "false", isSelf ? "true" : "false"));
            } catch {}
            return 0;
        }
    }

    class AudioNotificationClient : IMMNotificationClient {
        public void OnDeviceStateChanged(string pwstrDeviceId, int dwNewState) {}
        public void OnDeviceAdded(string pwstrDeviceId) {}
        public void OnDeviceRemoved(string pwstrDeviceId) {}
        public void OnDefaultDeviceChanged(int flow, int role, string pwstrDefaultDeviceId) {
            if (flow == 0 && (role == 0 || role == 1)) {
                Program.RebindDefaultAudioEndpoint();
            }
        }
        public void OnPropertyValueChanged(string pwstrDeviceId, IntPtr key) {}
    }

    class Program {
        public static readonly Guid WinIsleContextGuid = new Guid("11111111-2222-3333-4444-555555555555");
        private static readonly object s_consoleLock = new object();
        private static readonly object s_audioLock = new object();

        public static void SafeWriteLine(string line) {
            lock (s_consoleLock) {
                Console.WriteLine(line);
                Console.Out.Flush();
            }
        }

        [DllImport("kernel32.dll")]
        public static extern bool GetSystemPowerStatus(out SYSTEM_POWER_STATUS status);

        // DXVA2 Monitor API for external / desktop monitors
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        public struct PHYSICAL_MONITOR {
            public IntPtr hPhysicalMonitor;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)]
            public string szPhysicalMonitorDescription;
        }

        [DllImport("user32.dll")]
        static extern bool EnumDisplayMonitors(IntPtr hdc, IntPtr lprcClip, MonitorEnumProc lpfnEnum, IntPtr dwData);
        delegate bool MonitorEnumProc(IntPtr hMonitor, IntPtr hdcMonitor, IntPtr lprcMonitor, IntPtr dwData);

        [DllImport("dxva2.dll", SetLastError = true)]
        static extern bool GetNumberOfPhysicalMonitorsFromHMONITOR(IntPtr hMonitor, out uint pdwNumberOfPhysicalMonitors);

        [DllImport("dxva2.dll", SetLastError = true)]
        static extern bool GetPhysicalMonitorsFromHMONITOR(IntPtr hMonitor, uint dwPhysicalMonitorArraySize, [Out] PHYSICAL_MONITOR[] pPhysicalMonitorArray);

        [DllImport("dxva2.dll", SetLastError = true)]
        static extern bool DestroyPhysicalMonitors(uint dwPhysicalMonitorArraySize, [In] PHYSICAL_MONITOR[] pPhysicalMonitorArray);

        [DllImport("dxva2.dll", SetLastError = true)]
        static extern bool GetMonitorBrightness(IntPtr hMonitor, out uint pdwMinimumBrightness, out uint pdwCurrentBrightness, out uint pdwMaximumBrightness);

        [DllImport("dxva2.dll", SetLastError = true)]
        static extern bool SetMonitorBrightness(IntPtr hMonitor, uint dwNewBrightness);

        private static VolumeCallbackHandler s_callback;
        private static IAudioEndpointVolume s_endpoint;
        private static IMMDeviceEnumerator s_enumerator;
        private static AudioNotificationClient s_notifClient;

        public static IAudioEndpointVolume GetAudioEndpoint() {
            lock (s_audioLock) {
                if (s_endpoint != null) {
                    float testVal;
                    if (s_endpoint.GetMasterVolumeLevelScalar(out testVal) == 0) {
                        return s_endpoint;
                    }
                    s_endpoint = null;
                }
                try {
                    if (s_enumerator == null) {
                        s_enumerator = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator;
                    }
                    if (s_enumerator == null) return null;
                    IMMDevice dev = null;
                    // eRender (0), eConsole (0) is primary OS master audio endpoint; fallback to eMultimedia (1)
                    int hr = s_enumerator.GetDefaultAudioEndpoint(0, 0, out dev);
                    if (hr != 0 || dev == null) {
                        hr = s_enumerator.GetDefaultAudioEndpoint(0, 1, out dev);
                    }
                    if (hr != 0 || dev == null) return null;
                    Guid epvId = typeof(IAudioEndpointVolume).GUID;
                    IAudioEndpointVolume epv = null;
                    hr = dev.Activate(ref epvId, 23, 0, out epv);
                    if (hr != 0) return null;
                    s_endpoint = epv;
                    return s_endpoint;
                } catch {
                    return null;
                }
            }
        }

        public static void RebindDefaultAudioEndpoint() {
            lock (s_audioLock) {
                try {
                    if (s_endpoint != null && s_callback != null) {
                        try { s_endpoint.UnregisterControlChangeNotify(s_callback); } catch {}
                    }
                    s_endpoint = null;
                    var aev = GetAudioEndpoint();
                    if (aev != null) {
                        if (s_callback == null) s_callback = new VolumeCallbackHandler();
                        aev.RegisterControlChangeNotify(s_callback);

                        float v;
                        int vol = 0;
                        if (aev.GetMasterVolumeLevelScalar(out v) == 0) {
                            vol = (int)Math.Round(v * 100.0f);
                        }
                        bool m = false;
                        aev.GetMute(out m);
                        SafeWriteLine(string.Format("{{\"event\":\"volume_changed\",\"volume\":{0},\"muted\":{1},\"isSelf\":false}}", vol, m ? "true" : "false"));
                    }
                } catch {}
            }
        }

        static int? GetWmiBrightness() {
            try {
                using (var searcher = new ManagementObjectSearcher(@"root\wmi", "SELECT CurrentBrightness FROM WmiMonitorBrightness")) {
                    foreach (ManagementObject obj in searcher.Get()) {
                        object val = obj["CurrentBrightness"];
                        if (val != null) return Convert.ToInt32(val);
                    }
                }
            } catch {}
            return null;
        }

        static bool SetWmiBrightness(int targetPct) {
            bool success = false;
            try {
                using (var searcher = new ManagementObjectSearcher(@"root\wmi", "SELECT * FROM WmiMonitorBrightnessMethods")) {
                    foreach (ManagementObject obj in searcher.Get()) {
                        obj.InvokeMethod("WmiSetBrightness", new object[] { (uint)1, (byte)targetPct });
                        success = true;
                    }
                }
            } catch {}
            return success;
        }

        static int? GetDxvaBrightness() {
            int? result = null;
            try {
                EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, (IntPtr hMon, IntPtr hdc, IntPtr rc, IntPtr data) => {
                    uint count = 0;
                    if (GetNumberOfPhysicalMonitorsFromHMONITOR(hMon, out count) && count > 0) {
                        PHYSICAL_MONITOR[] phys = new PHYSICAL_MONITOR[count];
                        if (GetPhysicalMonitorsFromHMONITOR(hMon, count, phys)) {
                            for (int i = 0; i < count; i++) {
                                uint minB, curB, maxB;
                                if (GetMonitorBrightness(phys[i].hPhysicalMonitor, out minB, out curB, out maxB)) {
                                    if (maxB > minB) {
                                        result = (int)Math.Round((double)(curB - minB) * 100.0 / (maxB - minB));
                                        break;
                                    }
                                }
                            }
                            DestroyPhysicalMonitors(count, phys);
                        }
                    }
                    return result == null;
                }, IntPtr.Zero);
            } catch {}
            return result;
        }

        static bool SetDxvaBrightness(int targetPct) {
            bool success = false;
            try {
                EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, (IntPtr hMon, IntPtr hdc, IntPtr rc, IntPtr data) => {
                    uint count = 0;
                    if (GetNumberOfPhysicalMonitorsFromHMONITOR(hMon, out count) && count > 0) {
                        PHYSICAL_MONITOR[] phys = new PHYSICAL_MONITOR[count];
                        if (GetPhysicalMonitorsFromHMONITOR(hMon, count, phys)) {
                            for (int i = 0; i < count; i++) {
                                uint minB, curB, maxB;
                                if (GetMonitorBrightness(phys[i].hPhysicalMonitor, out minB, out curB, out maxB)) {
                                    uint newB = (uint)Math.Round(minB + (double)targetPct * (maxB - minB) / 100.0);
                                    if (SetMonitorBrightness(phys[i].hPhysicalMonitor, newB)) {
                                        success = true;
                                    }
                                }
                            }
                            DestroyPhysicalMonitors(count, phys);
                        }
                    }
                    return true;
                }, IntPtr.Zero);
            } catch {}
            return success;
        }

        public static string GetStatusJson(string reqId = null) {
            int? batteryLevel = null;
            bool? isCharging = null;
            try {
                SYSTEM_POWER_STATUS pwr;
                if (GetSystemPowerStatus(out pwr)) {
                    if (pwr.BatteryLifePercent <= 100) {
                        batteryLevel = (int)pwr.BatteryLifePercent;
                    }
                    if (pwr.ACLineStatus == 1 || (pwr.BatteryFlag & 8) != 0) {
                        isCharging = true;
                    } else if (pwr.ACLineStatus == 0) {
                        isCharging = false;
                    }
                }
            } catch {}

            int? volume = null;
            bool? muted = null;
            try {
                var aev = GetAudioEndpoint();
                if (aev != null) {
                    float v;
                    if (aev.GetMasterVolumeLevelScalar(out v) == 0) {
                        volume = (int)Math.Round(v * 100.0f);
                    }
                    bool m;
                    if (aev.GetMute(out m) == 0) {
                        muted = m;
                    }
                }
            } catch {}

            int? briPct = GetWmiBrightness();
            if (!briPct.HasValue) {
                briPct = GetDxvaBrightness();
            }
            int? brightnessScale10 = briPct.HasValue ? (int?)Math.Max(0, Math.Min(10, (int)Math.Round(briPct.Value / 10.0))) : null;

            string idPart = string.IsNullOrEmpty(reqId) ? "" : string.Format("\"id\":\"{0}\",", reqId);

            return string.Format(
                "{{{0}\"batteryLevel\":{1},\"isCharging\":{2},\"volume\":{3},\"muted\":{4},\"brightness\":{5},\"brightnessPercent\":{6}}}",
                idPart,
                batteryLevel.HasValue ? batteryLevel.Value.ToString() : "null",
                isCharging.HasValue ? (isCharging.Value ? "true" : "false") : "null",
                volume.HasValue ? volume.Value.ToString() : "null",
                muted.HasValue ? (muted.Value ? "true" : "false") : "null",
                brightnessScale10.HasValue ? brightnessScale10.Value.ToString() : "null",
                briPct.HasValue ? briPct.Value.ToString() : "null"
            );
        }

        public static bool ApplyControl(int? volume, bool? mute, int? brightnessPct) {
            bool ok = true;
            if (volume.HasValue || mute.HasValue) {
                try {
                    var aev = GetAudioEndpoint();
                    if (aev != null) {
                        Guid ctx = WinIsleContextGuid;
                        if (volume.HasValue) {
                            float clamped = Math.Max(0f, Math.Min(1f, volume.Value / 100.0f));
                            aev.SetMasterVolumeLevelScalar(clamped, ref ctx);
                        }
                        if (mute.HasValue) {
                            aev.SetMute(mute.Value, ref ctx);
                        }
                    } else {
                        ok = false;
                    }
                } catch {
                    ok = false;
                }
            }

            if (brightnessPct.HasValue) {
                int pct = Math.Max(0, Math.Min(100, brightnessPct.Value));
                bool wmiOk = SetWmiBrightness(pct);
                bool dxvaOk = SetDxvaBrightness(pct);
                if (!wmiOk && !dxvaOk) {
                    ok = false;
                }
            }

            return ok;
        }

        static void Main(string[] args) {
            if (args.Length > 0 && args[0].Equals("--daemon", StringComparison.OrdinalIgnoreCase)) {
                // Initialize audio endpoint, event callback, and device notification client
                try {
                    s_endpoint = GetAudioEndpoint();
                    if (s_endpoint != null) {
                        s_callback = new VolumeCallbackHandler();
                        s_endpoint.RegisterControlChangeNotify(s_callback);
                    }
                    if (s_enumerator != null) {
                        s_notifClient = new AudioNotificationClient();
                        s_enumerator.RegisterEndpointNotificationCallback(s_notifClient);
                    }
                } catch {}

                string line;
                while ((line = Console.ReadLine()) != null) {
                    line = line.Trim();
                    if (line.Length == 0) continue;
                    if (line.Equals("quit", StringComparison.OrdinalIgnoreCase) || line.Equals("exit", StringComparison.OrdinalIgnoreCase)) break;

                    string reqId = null;
                    string cleanLine = line;
                    if (cleanLine.StartsWith("id=", StringComparison.OrdinalIgnoreCase)) {
                        int sp = cleanLine.IndexOf(' ');
                        if (sp > 3) {
                            reqId = cleanLine.Substring(3, sp - 3);
                            cleanLine = cleanLine.Substring(sp + 1).Trim();
                        }
                    }

                    if (cleanLine.StartsWith("get", StringComparison.OrdinalIgnoreCase)) {
                        SafeWriteLine(GetStatusJson(reqId));
                        continue;
                    }
                    if (cleanLine.StartsWith("set", StringComparison.OrdinalIgnoreCase)) {
                        int? vol = null;
                        bool? mute = null;
                        int? bri = null;
                        string remainder = cleanLine.Length > 3 ? cleanLine.Substring(3).Trim() : "";
                        string[] tokens = remainder.Split(new char[] { ' ', '\t' }, StringSplitOptions.RemoveEmptyEntries);
                        foreach (var token in tokens) {
                            int eq = token.IndexOf('=');
                            if (eq <= 0) continue;
                            string k = token.Substring(0, eq).ToLowerInvariant();
                            string v = token.Substring(eq + 1);
                            if (k == "vol" || k == "volume") {
                                int parsed;
                                if (int.TryParse(v, out parsed)) vol = parsed;
                            } else if (k == "mute") {
                                if (v == "1" || v.Equals("true", StringComparison.OrdinalIgnoreCase)) mute = true;
                                else if (v == "0" || v.Equals("false", StringComparison.OrdinalIgnoreCase)) mute = false;
                            } else if (k == "bri" || k == "brightness") {
                                int parsed;
                                if (int.TryParse(v, out parsed)) bri = parsed;
                            }
                        }
                        bool applied = ApplyControl(vol, mute, bri);
                        string idPart = string.IsNullOrEmpty(reqId) ? "" : string.Format("\"id\":\"{0}\",", reqId);
                        SafeWriteLine(string.Format("{{{0}\"ok\":{1}}}", idPart, applied ? "true" : "false"));
                        continue;
                    }

                    string errIdPart = string.IsNullOrEmpty(reqId) ? "" : string.Format("\"id\":\"{0}\",", reqId);
                    SafeWriteLine(string.Format("{{{0}\"error\":\"unknown command\"}}", errIdPart));
                }

                if (s_endpoint != null && s_callback != null) {
                    try { s_endpoint.UnregisterControlChangeNotify(s_callback); } catch {}
                }
                if (s_enumerator != null && s_notifClient != null) {
                    try { s_enumerator.UnregisterEndpointNotificationCallback(s_notifClient); } catch {}
                }
                return;
            }

            // One-shot mode
            if (args.Length == 0 || args[0].Equals("get", StringComparison.OrdinalIgnoreCase) || args[0].Equals("status", StringComparison.OrdinalIgnoreCase)) {
                Console.WriteLine(GetStatusJson(null));
                return;
            }

            if (args[0].Equals("set", StringComparison.OrdinalIgnoreCase)) {
                int? vol = null;
                bool? mute = null;
                int? bri = null;
                for (int i = 1; i < args.Length; i++) {
                    string arg = args[i];
                    int eq = arg.IndexOf('=');
                    if (eq <= 0) continue;
                    string k = arg.Substring(0, eq).ToLowerInvariant();
                    string v = arg.Substring(eq + 1);
                    if (k == "vol" || k == "volume") {
                        int parsed;
                        if (int.TryParse(v, out parsed)) vol = parsed;
                    } else if (k == "mute") {
                        if (v == "1" || v.Equals("true", StringComparison.OrdinalIgnoreCase)) mute = true;
                        else if (v == "0" || v.Equals("false", StringComparison.OrdinalIgnoreCase)) mute = false;
                    } else if (k == "bri" || k == "brightness") {
                        int parsed;
                        if (int.TryParse(v, out parsed)) bri = parsed;
                    }
                }
                bool applied = ApplyControl(vol, mute, bri);
                Console.WriteLine(applied ? "{\"ok\":true}" : "{\"ok\":false}");
                return;
            }

            Console.WriteLine("{\"error\":\"invalid usage\"}");
        }
    }
}
