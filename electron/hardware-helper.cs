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
        int SetMasterVolumeLevel(float fLevelDB, Guid pguidEventContext);
        int SetMasterVolumeLevelScalar(float fLevel, Guid pguidEventContext);
        int GetMasterVolumeLevel(out float pfLevelDB);
        int GetMasterVolumeLevelScalar(out float pfLevel);
        int SetChannelVolumeLevel(uint nChannel, float fLevelDB, Guid pguidEventContext);
        int SetChannelVolumeLevelScalar(uint nChannel, float fLevel, Guid pguidEventContext);
        int GetChannelVolumeLevel(uint nChannel, out float pfLevelDB);
        int GetChannelVolumeLevelScalar(uint nChannel, out float pfLevel);
        int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, Guid pguidEventContext);
        int GetMute(out bool pbMute);
    }

    [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IMMDevice {
        int Activate(ref Guid id, int clsCtx, int activationParams, out IAudioEndpointVolume aev);
    }

    [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IMMDeviceEnumerator {
        int NotImpl1();
        int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
    }

    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    public class MMDeviceEnumeratorComObject { }

    class VolumeCallbackHandler : IAudioEndpointVolumeCallback {
        public int OnNotify(IntPtr pNotify) {
            try {
                var data = (AUDIO_VOLUME_NOTIFICATION_DATA)Marshal.PtrToStructure(pNotify, typeof(AUDIO_VOLUME_NOTIFICATION_DATA));
                int vol = (int)Math.Round(data.fMasterVolume * 100.0f);
                Console.WriteLine(string.Format("{{\"event\":\"volume_changed\",\"volume\":{0},\"muted\":{1}}}", vol, data.bMuted ? "true" : "false"));
                Console.Out.Flush();
            } catch {}
            return 0;
        }
    }

    class Program {
        [DllImport("kernel32.dll")]
        public static extern bool GetSystemPowerStatus(out SYSTEM_POWER_STATUS status);

        // DXVA2 Monitor API for external / desktop monitors
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
        public struct PHYSICAL_MONITOR {
            public IntPtr hPhysicalMonitor;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)]
            public string szPhysicalMonitorDescription;
        }

        [DllImport("user32.dll")]
        static extern bool EnumDisplayMonitors(IntPtr hdc, IntPtr lprcClip, MonitorEnumProc lpfnEnum, IntPtr dwData);
        delegate bool MonitorEnumProc(IntPtr hMonitor, IntPtr hdcMonitor, IntPtr lprcMonitor, IntPtr dwData);

        [DllImport("dxva2.dll")]
        static extern bool GetNumberOfPhysicalMonitorsFromHMONITOR(IntPtr hMonitor, out uint pdwNumberOfPhysicalMonitors);

        [DllImport("dxva2.dll")]
        static extern bool GetPhysicalMonitorsFromHMONITOR(IntPtr hMonitor, uint dwPhysicalMonitorArraySize, [Out] PHYSICAL_MONITOR[] pPhysicalMonitorArray);

        [DllImport("dxva2.dll")]
        static extern bool DestroyPhysicalMonitors(uint dwPhysicalMonitorArraySize, [In] PHYSICAL_MONITOR[] pPhysicalMonitorArray);

        [DllImport("dxva2.dll")]
        static extern bool GetMonitorBrightness(IntPtr hMonitor, out uint pdwMinimumBrightness, out uint pdwCurrentBrightness, out uint pdwMaximumBrightness);

        [DllImport("dxva2.dll")]
        static extern bool SetMonitorBrightness(IntPtr hMonitor, uint dwNewBrightness);

        private static VolumeCallbackHandler s_callback;
        private static IAudioEndpointVolume s_endpoint;

        static IAudioEndpointVolume GetAudioEndpoint() {
            if (s_endpoint != null) return s_endpoint;
            try {
                var enumerator = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator;
                if (enumerator == null) return null;
                IMMDevice dev = null;
                int hr = enumerator.GetDefaultAudioEndpoint(0, 1, out dev);
                if (hr != 0 || dev == null) return null;
                Guid epvId = typeof(IAudioEndpointVolume).GUID;
                IAudioEndpointVolume epv = null;
                hr = dev.Activate(ref epvId, 23, 0, out epv);
                if (hr != 0) return null;
                return epv;
            } catch {
                return null;
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
                        obj.InvokeMethod("WmiSetBrightness", new object[] { 1, targetPct });
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

        public static string GetStatusJson() {
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

            return string.Format(
                "{{\"batteryLevel\":{0},\"isCharging\":{1},\"volume\":{2},\"muted\":{3},\"brightness\":{4},\"brightnessPercent\":{5}}}",
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
                        if (volume.HasValue) {
                            float clamped = Math.Max(0f, Math.Min(1f, volume.Value / 100.0f));
                            aev.SetMasterVolumeLevelScalar(clamped, Guid.Empty);
                        }
                        if (mute.HasValue) {
                            aev.SetMute(mute.Value, Guid.Empty);
                        }
                    }
                } catch {
                    ok = false;
                }
            }

            if (brightnessPct.HasValue) {
                int pct = Math.Max(0, Math.Min(100, brightnessPct.Value));
                bool setOk = SetWmiBrightness(pct);
                if (!setOk) {
                    setOk = SetDxvaBrightness(pct);
                }
                if (!setOk) ok = false;
            }

            return ok;
        }

        static void Main(string[] args) {
            if (args.Length > 0 && args[0].Equals("--daemon", StringComparison.OrdinalIgnoreCase)) {
                // Initialize audio endpoint & event callback for real-time notifications
                try {
                    s_endpoint = GetAudioEndpoint();
                    if (s_endpoint != null) {
                        s_callback = new VolumeCallbackHandler();
                        s_endpoint.RegisterControlChangeNotify(s_callback);
                    }
                } catch {}

                string line;
                while ((line = Console.ReadLine()) != null) {
                    line = line.Trim();
                    if (line.Length == 0) continue;
                    if (line.Equals("quit", StringComparison.OrdinalIgnoreCase) || line.Equals("exit", StringComparison.OrdinalIgnoreCase)) break;
                    if (line.StartsWith("get", StringComparison.OrdinalIgnoreCase)) {
                        Console.WriteLine(GetStatusJson());
                        Console.Out.Flush();
                        continue;
                    }
                    if (line.StartsWith("set ", StringComparison.OrdinalIgnoreCase)) {
                        int? vol = null;
                        bool? mute = null;
                        int? bri = null;
                        string[] tokens = line.Substring(4).Split(new char[] { ' ', '\t' }, StringSplitOptions.RemoveEmptyEntries);
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
                        Console.WriteLine(applied ? "{\"ok\":true}" : "{\"ok\":false}");
                        Console.Out.Flush();
                        continue;
                    }
                    Console.WriteLine("{\"error\":\"unknown command\"}");
                    Console.Out.Flush();
                }

                if (s_endpoint != null && s_callback != null) {
                    try { s_endpoint.UnregisterControlChangeNotify(s_callback); } catch {}
                }
                return;
            }

            // One-shot mode
            if (args.Length == 0 || args[0].Equals("get", StringComparison.OrdinalIgnoreCase) || args[0].Equals("status", StringComparison.OrdinalIgnoreCase)) {
                Console.WriteLine(GetStatusJson());
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
