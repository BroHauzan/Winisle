use std::io::Cursor;
use std::time::Instant;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use windows::Win32::Foundation::HANDLE;
use windows::Win32::System::Threading::GetCurrentProcess;
use windows::Win32::UI::WindowsAndMessaging::{
    GetSystemMetrics, SM_CXSCREEN, SM_CYSCREEN, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN,
    SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN,
};
use winisle_lib::screenshot::get_system_screenshot;

extern "system" {
    fn GetGuiResources(hProcess: HANDLE, uiFlags: u32) -> u32;
    fn OpenInputDesktop(dwFlags: u32, fInherit: i32, dwDesiredAccess: u32) -> *mut std::ffi::c_void;
    fn SetThreadDesktop(hDesktop: *mut std::ffi::c_void) -> i32;
    fn CloseDesktop(hDesktop: *mut std::ffi::c_void) -> i32;
}

const GR_GDIOBJECTS: u32 = 0;
const GR_USEROBJECTS: u32 = 1;

fn get_gdi_object_count() -> u32 {
    unsafe {
        let process: HANDLE = GetCurrentProcess();
        GetGuiResources(process, GR_GDIOBJECTS)
    }
}

fn get_user_object_count() -> u32 {
    unsafe {
        let process: HANDLE = GetCurrentProcess();
        GetGuiResources(process, GR_USEROBJECTS)
    }
}

/// Helper struct that attaches the current thread to the interactive input desktop
/// and closes the handle on drop.
struct ScopedInputDesktop {
    handle: *mut std::ffi::c_void,
}

impl ScopedInputDesktop {
    fn attach() -> Option<Self> {
        unsafe {
            let desk = OpenInputDesktop(0, 0, 0x01FF);
            if desk.is_null() {
                None
            } else {
                let _ = SetThreadDesktop(desk);
                Some(Self { handle: desk })
            }
        }
    }
}

impl Drop for ScopedInputDesktop {
    fn drop(&mut self) {
        unsafe {
            if !self.handle.is_null() {
                let _ = CloseDesktop(self.handle);
            }
        }
    }
}

#[test]
fn test_worker_thread_direct_screenshot_capture() {
    // REGRESSION TEST:
    // 1. Direct call on standard worker thread:
    let res = get_system_screenshot();
    println!(
        "[INTEGRATION] get_system_screenshot on standard worker thread result: {:?}",
        res.is_ok()
    );
    assert!(
        res.is_ok(),
        "get_system_screenshot() must succeed on worker thread without manual desktop setup: {:?}",
        res.err()
    );
    let b64 = res.unwrap();
    assert!(
        b64.starts_with("iVBORw0KGgo"),
        "Payload must start with PNG base64 magic bytes"
    );

    // 2. Explicitly spawned pristine background thread:
    let handle = std::thread::spawn(|| {
        let spawned_res = get_system_screenshot();
        assert!(
            spawned_res.is_ok(),
            "get_system_screenshot() failed on freshly spawned background thread: {:?}",
            spawned_res.err()
        );
        let s_b64 = spawned_res.unwrap();
        assert!(s_b64.starts_with("iVBORw0KGgo"));
    });
    handle.join().expect("Spawned worker thread panicked");

    // 3. Concurrent background threads:
    let mut thread_handles = Vec::new();
    for i in 0..3 {
        thread_handles.push(std::thread::spawn(move || {
            let thread_res = get_system_screenshot();
            assert!(
                thread_res.is_ok(),
                "Concurrent worker thread {} failed: {:?}",
                i,
                thread_res.err()
            );
            let c_b64 = thread_res.unwrap();
            assert!(c_b64.starts_with("iVBORw0KGgo"));
        }));
    }
    for h in thread_handles {
        h.join().expect("Concurrent thread join failed");
    }
    println!("[INTEGRATION] Successfully verified get_system_screenshot on isolated and concurrent worker threads.");
}


#[test]
fn test_screen_metrics_and_multi_monitor_bounds() {
    let x = unsafe { GetSystemMetrics(SM_XVIRTUALSCREEN) };
    let y = unsafe { GetSystemMetrics(SM_YVIRTUALSCREEN) };
    let width = unsafe { GetSystemMetrics(SM_CXVIRTUALSCREEN) };
    let height = unsafe { GetSystemMetrics(SM_CYVIRTUALSCREEN) };

    let primary_width = unsafe { GetSystemMetrics(SM_CXSCREEN) };
    let primary_height = unsafe { GetSystemMetrics(SM_CYSCREEN) };

    println!(
        "[EMPIRICAL] Virtual screen metrics: x={}, y={}, width={}, height={}",
        x, y, width, height
    );
    println!(
        "[EMPIRICAL] Primary screen metrics: width={}, height={}",
        primary_width, primary_height
    );

    assert!(primary_width > 0, "Primary width must be positive");
    assert!(primary_height > 0, "Primary height must be positive");
    assert!(width >= primary_width, "Virtual width must be >= primary width");
    assert!(height >= primary_height, "Virtual height must be >= primary height");
}

#[test]
fn test_png_header_and_magic_bytes_with_attached_desktop() {
    let _desktop = ScopedInputDesktop::attach()
        .expect("OpenInputDesktop must succeed on interactive Windows session");

    let result = get_system_screenshot();
    assert!(
        result.is_ok(),
        "get_system_screenshot must succeed with attached desktop: {:?}",
        result.err()
    );

    let b64 = result.unwrap();

    // 1. Verify standard Base64 PNG prefix
    assert!(
        b64.starts_with("iVBORw0KGgo"),
        "Screenshot payload must begin with PNG base64 magic bytes 'iVBORw0KGgo'"
    );

    // 2. Decode Base64 string to raw bytes
    let raw_png = STANDARD.decode(&b64).expect("Payload must be valid Base64");
    assert!(
        raw_png.len() > 32,
        "Decoded PNG payload must be larger than header size"
    );

    // 3. Verify standard PNG 8-byte file signature: \x89PNG\r\n\x1a\n
    let expected_signature: [u8; 8] = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    assert_eq!(
        &raw_png[0..8],
        &expected_signature,
        "PNG signature magic bytes must match PNG 8-byte signature"
    );

    // 4. Verify IHDR chunk header (chunk length 13, chunk type b"IHDR")
    let ihdr_type = &raw_png[12..16];
    assert_eq!(ihdr_type, b"IHDR", "First chunk in PNG must be IHDR");

    // Extract dimensions from IHDR (big-endian 32-bit integers)
    let png_width = u32::from_be_bytes(raw_png[16..20].try_into().unwrap());
    let png_height = u32::from_be_bytes(raw_png[20..24].try_into().unwrap());
    let bit_depth = raw_png[24];
    let color_type = raw_png[25];

    println!(
        "[EMPIRICAL] Decoded PNG: {}x{}, bit_depth={}, color_type={} (RGBA=6), payload_size={} bytes (b64 len: {})",
        png_width, png_height, bit_depth, color_type, raw_png.len(), b64.len()
    );

    assert!(png_width > 0, "Decoded PNG width must be > 0");
    assert!(png_height > 0, "Decoded PNG height must be > 0");
    assert_eq!(bit_depth, 8, "PNG bit depth must be 8 bits per channel");
    assert_eq!(color_type, 6, "PNG color type must be 6 (RGBA)");

    // 5. Verify dimensions match screen metrics
    let expected_width = unsafe {
        let v = GetSystemMetrics(SM_CXVIRTUALSCREEN);
        if v > 0 { v as u32 } else { GetSystemMetrics(SM_CXSCREEN) as u32 }
    };
    let expected_height = unsafe {
        let v = GetSystemMetrics(SM_CYVIRTUALSCREEN);
        if v > 0 { v as u32 } else { GetSystemMetrics(SM_CYSCREEN) as u32 }
    };

    assert_eq!(png_width, expected_width, "PNG width must match screen metrics");
    assert_eq!(png_height, expected_height, "PNG height must match screen metrics");
}

#[test]
fn test_repeated_captures_and_gdi_resource_leak_prevention() {
    let _desktop = ScopedInputDesktop::attach()
        .expect("OpenInputDesktop must succeed on interactive Windows session");

    let initial_gdi = get_gdi_object_count();
    let initial_user = get_user_object_count();

    println!(
        "[EMPIRICAL] Initial OS resources: GDI handles={}, User handles={}",
        initial_gdi, initial_user
    );

    let iterations = 30;
    println!(
        "[EMPIRICAL] Executing {} consecutive screenshot captures in a tight loop...",
        iterations
    );

    for i in 1..=iterations {
        let res = get_system_screenshot();
        assert!(res.is_ok(), "Capture {} failed: {:?}", i, res.err());
        let b64 = res.unwrap();
        assert!(b64.starts_with("iVBORw0KGgo"));

        if i % 10 == 0 {
            let current_gdi = get_gdi_object_count();
            println!(
                "[EMPIRICAL] After iteration {}: GDI handles={}",
                i, current_gdi
            );
        }
    }

    let final_gdi = get_gdi_object_count();
    let final_user = get_user_object_count();

    println!(
        "[EMPIRICAL] Final OS resources after {} captures: GDI handles={} (delta: {}), User handles={} (delta: {})",
        iterations,
        final_gdi,
        final_gdi as i32 - initial_gdi as i32,
        final_user,
        final_user as i32 - initial_user as i32
    );

    // If GDI DCs or Bitmaps leaked, 30 iterations would increase handles by at least 60-90.
    // A clean implementation must return handles to exactly the baseline (+/- 1 for internal system caching).
    assert!(
        final_gdi <= initial_gdi + 1,
        "GDI handles leaked! Initial: {}, Final: {}, Delta: {}",
        initial_gdi,
        final_gdi,
        final_gdi as i32 - initial_gdi as i32
    );
}

#[test]
fn test_png_full_redecode_with_png_crate() {
    let _desktop = ScopedInputDesktop::attach()
        .expect("OpenInputDesktop must succeed on interactive Windows session");

    let result = get_system_screenshot().expect("get_system_screenshot failed");
    let raw_bytes = STANDARD.decode(&result).expect("Base64 decode failed");

    // Fully decode the PNG stream using png::Decoder
    let cursor = Cursor::new(raw_bytes);
    let decoder = png::Decoder::new(cursor);
    let mut reader = decoder.read_info().expect("png::Decoder failed to read header");

    let buf_size = reader.output_buffer_size().unwrap_or(reader.info().raw_bytes());
    let mut buf = vec![0u8; buf_size];
    let info = reader.next_frame(&mut buf).expect("Failed to decode PNG frame");

    println!(
        "[EMPIRICAL] Fully decoded PNG frame: {}x{}, color_type={:?}, bit_depth={:?}, buffer_size={} bytes",
        info.width, info.height, info.color_type, info.bit_depth, buf.len()
    );

    assert_eq!(info.color_type, png::ColorType::Rgba);
    assert_eq!(info.bit_depth, png::BitDepth::Eight);
    assert_eq!(buf.len(), (info.width * info.height * 4) as usize);

    // Verify alpha channel: every 4th byte should be 255 (fully opaque)
    let non_opaque_pixels = buf.chunks_exact(4).filter(|chunk| chunk[3] != 255).count();
    assert_eq!(
        non_opaque_pixels, 0,
        "All pixels in screenshot must be set to full opacity (alpha 255)"
    );
}

#[test]
fn test_timing_breakdown_and_latency_analysis() {
    let _desktop = ScopedInputDesktop::attach()
        .expect("OpenInputDesktop must succeed on interactive Windows session");

    let runs = 10;
    println!("[EMPIRICAL] Measuring latency breakdown over {} runs...", runs);

    let mut total_elapsed_ms = 0.0;

    for _ in 0..runs {
        let t0 = Instant::now();
        let res = get_system_screenshot();
        let elapsed = t0.elapsed().as_secs_f64() * 1000.0;
        assert!(res.is_ok(), "Screenshot execution failed during latency benchmark");
        total_elapsed_ms += elapsed;
    }

    let avg_latency_ms = total_elapsed_ms / runs as f64;
    println!(
        "[EMPIRICAL] Average full screenshot capture latency: {:.2}ms per frame",
        avg_latency_ms
    );

    if avg_latency_ms > 50.0 {
        eprintln!(
            "[BENCHMARK NOTE] Average latency ({:.2}ms) exceeds 50ms in unoptimized debug build",
            avg_latency_ms
        );
    }
}
