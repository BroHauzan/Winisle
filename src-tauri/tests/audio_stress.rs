use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;
use std::time::Instant;
use windows::core::{implement, Result};
use windows::Win32::Media::Audio::Endpoints::{
    IAudioEndpointVolume, IAudioEndpointVolumeCallback, IAudioEndpointVolumeCallback_Impl,
};
use windows::Win32::Media::Audio::{
    eConsole, eMultimedia, eRender, AUDIO_VOLUME_NOTIFICATION_DATA, IMMDevice,
    IMMDeviceEnumerator, MMDeviceEnumerator,
};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CLSCTX_ALL, CLSCTX_INPROC_SERVER,
    COINIT_MULTITHREADED,
};
use winisle_lib::audio::{get_mute, get_volume, set_mute, set_volume, WINISLE_CONTEXT_GUID};

fn get_endpoint() -> std::result::Result<IAudioEndpointVolume, String> {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        let enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_INPROC_SERVER)
                .map_err(|e| format!("CoCreateInstance MMDeviceEnumerator failed: {e}"))?;
        let device: IMMDevice = match enumerator.GetDefaultAudioEndpoint(eRender, eConsole) {
            Ok(d) => d,
            Err(_) => enumerator
                .GetDefaultAudioEndpoint(eRender, eMultimedia)
                .map_err(|e| format!("GetDefaultAudioEndpoint failed: {e}"))?,
        };
        device
            .Activate::<IAudioEndpointVolume>(CLSCTX_ALL, None)
            .map_err(|e| format!("Activate IAudioEndpointVolume failed: {e}"))
    }
}

#[implement(IAudioEndpointVolumeCallback)]
struct TestCallback {
    sender: crossbeam_channel::Sender<AUDIO_VOLUME_NOTIFICATION_DATA>,
}

impl IAudioEndpointVolumeCallback_Impl for TestCallback_Impl {
    fn OnNotify(&self, pnotify: *mut AUDIO_VOLUME_NOTIFICATION_DATA) -> Result<()> {
        if !pnotify.is_null() {
            unsafe {
                let _ = self.sender.try_send(*pnotify);
            }
        }
        Ok(())
    }
}

#[test]
fn test_real_windows_audio_endpoint_and_com() {
    match get_volume() {
        Ok(vol) => {
            println!("[EMPIRICAL] Real Windows audio endpoint found! Initial volume: {}", vol);
            assert!(vol <= 100);

            let original_vol = vol;
            let target_vol = if original_vol > 50 { original_vol - 5 } else { original_vol + 5 };

            let set_res = set_volume(target_vol);
            assert!(set_res.is_ok(), "set_volume should succeed on valid endpoint");

            let read_back = get_volume().expect("get_volume after set");
            println!("[EMPIRICAL] Target: {}, Read back: {}", target_vol, read_back);
            assert_eq!(read_back, target_vol, "Read-back volume must match target");

            let _ = set_volume(original_vol);
        }
        Err(e) => {
            println!("[EMPIRICAL] Audio endpoint query returned: {}", e);
        }
    }
}

#[test]
fn test_rapid_100_volume_burst_on_real_com() {
    let initial_vol = match get_volume() {
        Ok(v) => v,
        Err(e) => {
            println!("[EMPIRICAL] Skipping rapid burst test (no endpoint): {}", e);
            return;
        }
    };

    println!("[EMPIRICAL] Starting 100-event rapid volume burst stress test...");
    let start = Instant::now();

    // Rapidly cycle volume 100 times between 40 and 60
    for i in 0..100 {
        let vol = 40 + (i % 21);
        let res = set_volume(vol);
        assert!(res.is_ok(), "set_volume failed at iteration {}: {:?}", i, res.err());
    }

    let elapsed = start.elapsed();
    let avg_per_call = elapsed.as_secs_f64() * 1000.0 / 100.0;
    println!(
        "[EMPIRICAL] 100 real Windows CoreAudio volume adjustments completed in {:.2}ms (avg {:.3}ms/call)",
        elapsed.as_secs_f64() * 1000.0,
        avg_per_call
    );

    // Verify endpoint did not deadlock and remains responsive
    let final_vol = get_volume().expect("get_volume after 100-burst");
    assert!(final_vol >= 40 && final_vol <= 60);

    // Restore initial volume
    let _ = set_volume(initial_vol);
}

#[test]
fn test_guid_context_and_callback_delivery() {
    let endpoint = match get_endpoint() {
        Ok(ep) => ep,
        Err(e) => {
            println!("[EMPIRICAL] Skipping callback delivery test (no endpoint): {}", e);
            return;
        }
    };

    let (tx, rx) = crossbeam_channel::bounded::<AUDIO_VOLUME_NOTIFICATION_DATA>(16);
    let cb: IAudioEndpointVolumeCallback = TestCallback { sender: tx }.into();

    unsafe {
        let reg_res = endpoint.RegisterControlChangeNotify(&cb);
        assert!(reg_res.is_ok(), "RegisterControlChangeNotify failed");
    }

    let initial_vol = get_volume().unwrap_or(50);
    let test_vol = if initial_vol == 72 { 73 } else { 72 };

    // Set volume with WINISLE_CONTEXT_GUID
    let set_res = set_volume(test_vol);
    assert!(set_res.is_ok(), "set_volume failed");

    // Wait for the COM notification callback (up to 500ms)
    let notif = rx.recv_timeout(std::time::Duration::from_millis(500));
    assert!(
        notif.is_ok(),
        "Expected OnNotify callback from CoreAudio within 500ms"
    );

    let data = notif.unwrap();
    let received_vol = (data.fMasterVolume * 100.0).round() as u32;
    let is_self = data.guidEventContext == WINISLE_CONTEXT_GUID;

    println!(
        "[EMPIRICAL] CoreAudio callback received! volume: {}, is_self: {}, guid: {:?}",
        received_vol, is_self, data.guidEventContext
    );

    assert_eq!(
        received_vol, test_vol,
        "Notification volume must match set volume"
    );
    assert!(
        is_self,
        "Notification guidEventContext must equal WINISLE_CONTEXT_GUID"
    );

    // Unregister callback
    unsafe {
        let _ = endpoint.UnregisterControlChangeNotify(&cb);
    }

    // Restore
    let _ = set_volume(initial_vol);
}

#[test]
fn test_multithreaded_com_concurrency() {
    if get_volume().is_err() {
        println!("[EMPIRICAL] Skipping concurrency test (no endpoint)");
        return;
    }

    println!("[EMPIRICAL] Starting 4-thread concurrent COM apartment stress test...");
    let thread_count = 4;
    let iterations_per_thread = 25;
    let success_count = Arc::new(AtomicU32::new(0));

    let mut handles = Vec::new();
    let start = Instant::now();

    for t in 0..thread_count {
        let sc = success_count.clone();
        let handle = std::thread::spawn(move || {
            for i in 0..iterations_per_thread {
                let vol = 30 + ((t * 10 + i) % 40);
                if set_volume(vol).is_ok() && get_volume().is_ok() {
                    sc.fetch_add(1, Ordering::Relaxed);
                }
            }
        });
        handles.push(handle);
    }

    for h in handles {
        h.join().expect("Worker thread panicked");
    }

    let elapsed = start.elapsed();
    let total_ops = success_count.load(Ordering::Relaxed);
    println!(
        "[EMPIRICAL] Concurrent stress finished: {} operations across 4 threads in {:.2}ms",
        total_ops,
        elapsed.as_secs_f64() * 1000.0
    );

    assert_eq!(
        total_ops,
        thread_count * iterations_per_thread,
        "All concurrent set_volume/get_volume calls must succeed without deadlock"
    );

    // Restore safe volume
    let _ = set_volume(50);
}

#[test]
fn test_mute_and_volume_boundary_clamping() {
    if get_volume().is_err() {
        println!("[EMPIRICAL] Skipping mute/volume boundary test (no endpoint)");
        return;
    }

    let initial_vol = get_volume().unwrap_or(50);
    let initial_mute = get_mute().unwrap_or(false);

    // Test volume 0 boundary
    assert!(set_volume(0).is_ok());
    assert_eq!(get_volume().unwrap(), 0);

    // Test volume 100 boundary
    assert!(set_volume(100).is_ok());
    assert_eq!(get_volume().unwrap(), 100);

    // Test volume clamping > 100
    assert!(set_volume(150).is_ok());
    assert_eq!(get_volume().unwrap(), 100);

    // Test mute preserving volume
    assert!(set_volume(45).is_ok());
    assert!(set_mute(true).is_ok());
    assert_eq!(get_mute().unwrap(), true);
    assert_eq!(get_volume().unwrap(), 45, "Volume scalar preserved when muted");

    assert!(set_mute(false).is_ok());
    assert_eq!(get_mute().unwrap(), false);
    assert_eq!(get_volume().unwrap(), 45, "Volume scalar preserved when unmuted");

    // Restore
    let _ = set_volume(initial_vol);
    let _ = set_mute(initial_mute);
}
