use std::sync::Arc;
use tauri::Manager;

pub mod audio;
pub mod cursor;
pub mod hardware;
pub mod media;
pub mod screenshot;
pub mod tray;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "windows")]
    unsafe {
        // Prevent Windows from ghosting the frameless overlay and showing "(Not Responding)" title bar
        windows::Win32::UI::WindowsAndMessaging::DisableProcessWindowsGhosting();
    }

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
            media::get_system_media,
            media::send_system_media_command,
        ])
        .setup(move |app| {
            if let Some(window) = app.get_webview_window("main") {
                // Ensure window is strictly frameless, transparent, and shadowless
                let _ = window.set_decorations(false);
                let _ = window.set_shadow(false);

                #[cfg(target_os = "windows")]
                {
                    use windows::Win32::Foundation::HWND;
                    use windows::Win32::Graphics::Dwm::{
                        DwmSetWindowAttribute, DWMNCRP_DISABLED, DWMWA_BORDER_COLOR,
                        DWMWA_NCRENDERING_POLICY, DWMWA_WINDOW_CORNER_PREFERENCE,
                        DWMWCP_DONOTROUND, DWM_WINDOW_CORNER_PREFERENCE,
                    };
                    use windows::Win32::UI::WindowsAndMessaging::{
                        GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos, GWL_STYLE,
                        SWP_FRAMECHANGED, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, WS_BORDER,
                        WS_CAPTION, WS_DLGFRAME, WS_MAXIMIZEBOX, WS_MINIMIZEBOX,
                        WS_POPUP, WS_SYSMENU, WS_THICKFRAME,
                    };

                    if let Ok(raw_hwnd) = window.hwnd() {
                        let hwnd = HWND(raw_hwnd.0);
                        unsafe {
                            // 1. Strip all caption, borders, minimize/maximize buttons, and system menu
                            let mut style = GetWindowLongPtrW(hwnd, GWL_STYLE);
                            style &= !(WS_CAPTION.0 as isize
                                | WS_THICKFRAME.0 as isize
                                | WS_MINIMIZEBOX.0 as isize
                                | WS_MAXIMIZEBOX.0 as isize
                                | WS_SYSMENU.0 as isize
                                | WS_BORDER.0 as isize
                                | WS_DLGFRAME.0 as isize);
                            style |= WS_POPUP.0 as isize;
                            SetWindowLongPtrW(hwnd, GWL_STYLE, style);

                            // 2. Disable DWM Non-Client Rendering completely (eliminates title bar, buttons, and frame)
                            let ncrp = DWMNCRP_DISABLED.0 as u32;
                            let _ = DwmSetWindowAttribute(
                                hwnd,
                                DWMWA_NCRENDERING_POLICY,
                                &ncrp as *const _ as *const _,
                                std::mem::size_of::<u32>() as u32,
                            );

                            // 3. Disable Windows 11 window corner rounding
                            let corner_pref = DWMWCP_DONOTROUND;
                            let _ = DwmSetWindowAttribute(
                                hwnd,
                                DWMWA_WINDOW_CORNER_PREFERENCE,
                                &corner_pref as *const _ as *const _,
                                std::mem::size_of::<DWM_WINDOW_CORNER_PREFERENCE>() as u32,
                            );

                            // 4. Remove 1px DWM border
                            let border_color: u32 = 0xFFFFFFFE;
                            let _ = DwmSetWindowAttribute(
                                hwnd,
                                DWMWA_BORDER_COLOR,
                                &border_color as *const _ as *const _,
                                std::mem::size_of::<u32>() as u32,
                            );

                            // 5. Notify system that non-client frame changed
                            let _ = SetWindowPos(
                                hwnd,
                                HWND(std::ptr::null_mut()),
                                0,
                                0,
                                0,
                                0,
                                SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED,
                            );
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

                // Reveal window
                let _ = window.show();
            }

            // Spawn the adaptive cursor monitor thread
            cursor::spawn_cursor_monitor(app.handle().clone(), cursor_state_clone);

            // Start the native Windows CoreAudio volume listener
            audio::start_audio_listener(app.handle().clone());

            // Start the native Windows GSMTC media listener
            media::spawn_media_monitor(app.handle().clone());

            // Initialize system tray icon, context menu, and Alt+Q hotkey
            let _ = tray::setup_tray(app.handle());
            tray::spawn_global_hotkey(app.handle().clone());

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running WinIsle application");
}
