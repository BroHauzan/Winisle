use std::sync::Arc;
use tauri::Manager;

pub mod cursor;
pub mod audio;
pub mod hardware;
pub mod screenshot;
pub mod tray;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let cursor_state = Arc::new(cursor::CursorMonitorState::new());
    let cursor_state_clone = cursor_state.clone();

    tauri::Builder::default()
        .manage(cursor_state)
        .invoke_handler(tauri::generate_handler![
            cursor::update_island_bounds,
            cursor::set_interactive_lock,
            cursor::set_click_through,
            cursor::set_ignore_mouse_events,
            audio::get_volume,
            audio::set_volume,
            audio::get_mute,
            audio::set_mute,
            hardware::get_brightness,
            hardware::set_brightness,
            hardware::get_battery_status,
            screenshot::get_system_screenshot,
        ])
        .setup(move |app| {
            if let Some(window) = app.get_webview_window("main") {
                // Initialize DWM transparent glass frame into client area
                #[cfg(target_os = "windows")]
                {
                    use windows::Win32::Foundation::HWND;

                    #[repr(C)]
                    #[allow(non_snake_case)]
                    struct MARGINS {
                        cxLeftWidth: i32,
                        cxRightWidth: i32,
                        cyTopHeight: i32,
                        cyBottomHeight: i32,
                    }

                    extern "system" {
                        fn DwmExtendFrameIntoClientArea(
                            hwnd: HWND,
                            pmarinset: *const MARGINS,
                        ) -> windows::core::HRESULT;
                    }

                    if let Ok(raw_hwnd) = window.hwnd() {
                        let hwnd = HWND(raw_hwnd.0);
                        let margins = MARGINS {
                            cxLeftWidth: -1,
                            cxRightWidth: -1,
                            cyTopHeight: -1,
                            cyBottomHeight: -1,
                        };
                        unsafe {
                            let _ = DwmExtendFrameIntoClientArea(hwnd, &margins);
                        }
                    }
                }

                // Center window horizontally at top: 0 of primary monitor
                if let Ok(Some(monitor)) = window.primary_monitor() {
                    let screen_size = monitor.size();
                    let scale_factor = monitor.scale_factor();
                    let logical_width = 740.0;
                    let screen_logical_width = screen_size.width as f64 / scale_factor;
                    let target_x = ((screen_logical_width - logical_width) / 2.0).round();
                    let _ = window.set_position(tauri::Position::Logical(tauri::LogicalPosition {
                        x: target_x,
                        y: 0.0,
                    }));
                }

                // Initial click-through configuration: ignore cursor events outside island
                let _ = window.set_ignore_cursor_events(true);

                // Reveal window after DWM glass margins, positioning, and click-through are configured
                let _ = window.show();
            }

            // Spawn the adaptive cursor monitor thread
            cursor::spawn_cursor_monitor(app.handle().clone(), cursor_state_clone);

            // Start the native Windows CoreAudio volume listener
            audio::start_audio_listener(app.handle().clone());

            // Initialize system tray icon, context menu, and Alt+Q hotkey
            let _ = tray::setup_tray(app.handle());
            tray::spawn_global_hotkey(app.handle().clone());

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running WinIsle application");
}
