use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
use std::time::Duration;
use windows::Win32::Foundation::{LPARAM, WPARAM};
use windows::Win32::System::Threading::GetCurrentThreadId;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    RegisterHotKey, UnregisterHotKey, HOT_KEY_MODIFIERS, MOD_ALT, MOD_NOREPEAT,
};
use windows::Win32::UI::WindowsAndMessaging::{
    DispatchMessageW, GetMessageW, PeekMessageW, PostThreadMessageW, TranslateMessage, MSG,
    PM_NOREMOVE, WM_HOTKEY, WM_QUIT,
};

#[test]
fn test_hotkey_modifiers_and_vk_constants() {
    // MOD_ALT is 0x0001, MOD_NOREPEAT is 0x4000
    // Combined must be 0x4001 to ensure OS suppresses autorepeat
    let modifiers: HOT_KEY_MODIFIERS = MOD_ALT | MOD_NOREPEAT;
    assert_eq!(modifiers.0, 0x4001, "MOD_ALT | MOD_NOREPEAT must be 0x4001");

    // Virtual key code for 'Q' is 0x51
    let vk_q = 0x51u32;
    assert_eq!(vk_q, b'Q' as u32, "Virtual key 0x51 must correspond to 'Q'");
}

#[test]
fn test_dedicated_thread_message_pump_and_hotkey_lifecycle() {
    let thread_started = Arc::new(AtomicBool::new(false));
    let thread_id = Arc::new(AtomicU32::new(0));
    let hotkey_events_received = Arc::new(AtomicU32::new(0));
    let loop_exited = Arc::new(AtomicBool::new(false));

    let t_started = Arc::clone(&thread_started);
    let t_id = Arc::clone(&thread_id);
    let t_events = Arc::clone(&hotkey_events_received);
    let t_exited = Arc::clone(&loop_exited);

    let handle = std::thread::Builder::new()
        .name("test-hotkey-pump".into())
        .spawn(move || {
            unsafe {
                let tid = GetCurrentThreadId();
                t_id.store(tid, Ordering::SeqCst);

                // 1. Force message queue creation via PeekMessageW
                let mut dummy_msg = MSG::default();
                let _ = PeekMessageW(&mut dummy_msg, None, 0, 0, PM_NOREMOVE);
                t_started.store(true, Ordering::SeqCst);

                // 2. Register test hotkey with MOD_NOREPEAT (ID = 9999 to avoid colliding with main app)
                let test_hotkey_id = 9999;
                let reg_res = RegisterHotKey(
                    None,
                    test_hotkey_id,
                    MOD_ALT | MOD_NOREPEAT,
                    0x51,
                );

                let is_registered = reg_res.is_ok();
                if let Err(e) = &reg_res {
                    println!("[TEST] RegisterHotKey note: {} (may be in use by running desktop process)", e);
                }

                // 3. Message pump
                let mut msg = MSG::default();
                while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                    if msg.message == WM_HOTKEY && msg.wParam.0 == test_hotkey_id as usize {
                        t_events.fetch_add(1, Ordering::SeqCst);
                    }
                    let _ = TranslateMessage(&msg);
                    DispatchMessageW(&msg);
                }

                if is_registered {
                    let _ = UnregisterHotKey(None, test_hotkey_id);
                }
                t_exited.store(true, Ordering::SeqCst);
            }
        })
        .expect("spawn test-hotkey-pump");

    // Wait for thread to initialize message queue
    for _ in 0..50 {
        if thread_started.load(Ordering::SeqCst) {
            break;
        }
        std::thread::sleep(Duration::from_millis(10));
    }
    assert!(thread_started.load(Ordering::SeqCst), "Hotkey thread must initialize message queue");

    let tid = thread_id.load(Ordering::SeqCst);
    assert_ne!(tid, 0, "Thread ID must be non-zero");

    // Post 5 simulated WM_HOTKEY messages directly to the message queue
    for _ in 0..5 {
        unsafe {
            let res = PostThreadMessageW(tid, WM_HOTKEY, WPARAM(9999), LPARAM(0));
            assert!(res.is_ok(), "PostThreadMessageW should succeed");
        }
        std::thread::sleep(Duration::from_millis(5));
    }

    // Give time to pump messages
    std::thread::sleep(Duration::from_millis(50));
    assert_eq!(
        hotkey_events_received.load(Ordering::SeqCst),
        5,
        "Message pump must process all 5 WM_HOTKEY messages without loss"
    );

    // Cleanly terminate the thread message pump with WM_QUIT
    unsafe {
        let _ = PostThreadMessageW(tid, WM_QUIT, WPARAM(0), LPARAM(0));
    }

    let join_res = handle.join();
    assert!(join_res.is_ok(), "Thread must terminate cleanly without panic");
    assert!(loop_exited.load(Ordering::SeqCst), "Loop must have exited on WM_QUIT");
}

#[test]
fn test_concurrent_hotkey_post_and_rapid_bursts() {
    let thread_id = Arc::new(AtomicU32::new(0));
    let event_count = Arc::new(AtomicU32::new(0));
    let ready = Arc::new(AtomicBool::new(false));

    let t_id = Arc::clone(&thread_id);
    let t_count = Arc::clone(&event_count);
    let t_ready = Arc::clone(&ready);

    let pump_thread = std::thread::spawn(move || {
        unsafe {
            t_id.store(GetCurrentThreadId(), Ordering::SeqCst);
            let mut dummy = MSG::default();
            let _ = PeekMessageW(&mut dummy, None, 0, 0, PM_NOREMOVE);
            t_ready.store(true, Ordering::SeqCst);

            let mut msg = MSG::default();
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                if msg.message == WM_HOTKEY {
                    t_count.fetch_add(1, Ordering::SeqCst);
                }
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        }
    });

    while !ready.load(Ordering::SeqCst) {
        std::thread::sleep(Duration::from_millis(5));
    }
    let tid = thread_id.load(Ordering::SeqCst);

    // Multi-producer concurrency: 4 threads simultaneously posting 25 hotkeys = 100 total
    let mut senders = vec![];
    for _thread_idx in 0..4 {
        let handle = std::thread::spawn(move || {
            for _ in 0..25 {
                unsafe {
                    let _ = PostThreadMessageW(tid, WM_HOTKEY, WPARAM(1), LPARAM(0));
                }
            }
        });
        senders.push(handle);
    }

    for s in senders {
        s.join().unwrap();
    }

    // Allow pump to drain all 100 messages
    for _ in 0..100 {
        if event_count.load(Ordering::SeqCst) == 100 {
            break;
        }
        std::thread::sleep(Duration::from_millis(10));
    }

    assert_eq!(
        event_count.load(Ordering::SeqCst),
        100,
        "Dedicated message pump must survive concurrent multi-threaded burst of 100 messages with 0 drops"
    );

    unsafe {
        let _ = PostThreadMessageW(tid, WM_QUIT, WPARAM(0), LPARAM(0));
    }
    pump_thread.join().unwrap();
}
