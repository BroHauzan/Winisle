use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{command, AppHandle, Emitter};

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct SystemMediaInfo {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub is_playing: bool,
    pub position_ms: u64,
    pub duration_ms: u64,
    pub source_app: String,
    pub shuffle_active: bool,
}

#[cfg(target_os = "windows")]
mod win_media {
    use super::*;
    use windows::Media::Control::{
        GlobalSystemMediaTransportControlsSession,
        GlobalSystemMediaTransportControlsSessionManager,
        GlobalSystemMediaTransportControlsSessionPlaybackStatus,
    };

    fn clean_source_app(raw_app: &str) -> String {
        let lower = raw_app.to_lowercase();
        if lower.contains("chrome") {
            "Google Chrome".to_string()
        } else if lower.contains("spotify") {
            "Spotify".to_string()
        } else if lower.contains("msedge") || lower.contains("edge") {
            "Microsoft Edge".to_string()
        } else if lower.contains("firefox") {
            "Firefox".to_string()
        } else if lower.contains("brave") {
            "Brave".to_string()
        } else if !raw_app.is_empty() {
            // Strip .exe or path
            raw_app
                .split('\\')
                .last()
                .unwrap_or(raw_app)
                .trim_end_matches(".exe")
                .to_string()
        } else {
            "Media Player".to_string()
        }
    }

    pub fn query_current_media() -> Result<Option<SystemMediaInfo>, String> {
        let async_mgr = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
            .map_err(|e| format!("GSMTC RequestAsync error: {}", e))?;
        let mgr = async_mgr
            .get()
            .map_err(|e| format!("GSMTC manager error: {}", e))?;

        let session = match mgr.GetCurrentSession() {
            Ok(s) => s,
            Err(_) => return Ok(None),
        };

        extract_session_info(&session)
    }

    fn extract_session_info(
        session: &GlobalSystemMediaTransportControlsSession,
    ) -> Result<Option<SystemMediaInfo>, String> {
        let raw_app_id = session
            .SourceAppUserModelId()
            .map(|s| s.to_string())
            .unwrap_or_default();
        let source_app = clean_source_app(&raw_app_id);

        let playback_info = match session.GetPlaybackInfo() {
            Ok(info) => info,
            Err(_) => return Ok(None),
        };

        let status = playback_info
            .PlaybackStatus()
            .unwrap_or(GlobalSystemMediaTransportControlsSessionPlaybackStatus::Closed);

        let is_playing = status == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing;

        // If stopped or closed and has no info, return None
        if status == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Closed
            || status == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Stopped
        {
            return Ok(None);
        }

        let shuffle_active = playback_info
            .IsShuffleActive()
            .ok()
            .and_then(|boxed| boxed.Value().ok())
            .unwrap_or(false);

        let async_props = session
            .TryGetMediaPropertiesAsync()
            .map_err(|e| e.to_string())?;
        let media_props = async_props.get().map_err(|e| e.to_string())?;

        let title = media_props
            .Title()
            .map(|s| s.to_string())
            .unwrap_or_default();
        let artist = media_props
            .Artist()
            .map(|s| s.to_string())
            .unwrap_or_default();
        let album = media_props
            .AlbumTitle()
            .map(|s| s.to_string())
            .unwrap_or_default();

        if title.trim().is_empty() && artist.trim().is_empty() {
            return Ok(None);
        }

        let mut position_ms: u64 = 0;
        let mut duration_ms: u64 = 0;

        if let Ok(timeline) = session.GetTimelineProperties() {
            if let Ok(pos) = timeline.Position() {
                // TimeSpan Duration is in 100-nanosecond units
                position_ms = (pos.Duration / 10_000).max(0) as u64;
            }
            if let Ok(end) = timeline.EndTime() {
                duration_ms = (end.Duration / 10_000).max(0) as u64;
            }
        }

        Ok(Some(SystemMediaInfo {
            title,
            artist,
            album,
            is_playing,
            position_ms,
            duration_ms,
            source_app,
            shuffle_active,
        }))
    }

    pub fn send_media_control(action: &str, target_shuffle: Option<bool>) -> Result<(), String> {
        let async_mgr = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
            .map_err(|e| e.to_string())?;
        let mgr = async_mgr.get().map_err(|e| e.to_string())?;

        let session = mgr.GetCurrentSession().map_err(|e| e.to_string())?;

        match action {
            "play_pause" | "toggle" => {
                let op = session
                    .TryTogglePlayPauseAsync()
                    .map_err(|e| e.to_string())?;
                let _ = op.get();
            }
            "play" => {
                let op = session.TryPlayAsync().map_err(|e| e.to_string())?;
                let _ = op.get();
            }
            "pause" => {
                let op = session.TryPauseAsync().map_err(|e| e.to_string())?;
                let _ = op.get();
            }
            "next" => {
                let op = session.TrySkipNextAsync().map_err(|e| e.to_string())?;
                let _ = op.get();
            }
            "prev" | "previous" => {
                let op = session.TrySkipPreviousAsync().map_err(|e| e.to_string())?;
                let _ = op.get();
            }
            "shuffle" => {
                if let Some(target) = target_shuffle {
                    let op = session
                        .TryChangeShuffleActiveAsync(target)
                        .map_err(|e| e.to_string())?;
                    let _ = op.get();
                }
            }
            _ => return Err(format!("Unknown media action: {}", action)),
        }

        Ok(())
    }
}

#[command]
pub fn get_system_media() -> Result<Option<SystemMediaInfo>, String> {
    #[cfg(target_os = "windows")]
    {
        win_media::query_current_media()
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(None)
    }
}

#[command]
pub fn send_system_media_command(
    action: String,
    target_shuffle: Option<bool>,
) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        win_media::send_media_control(&action, target_shuffle)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (action, target_shuffle);
        Ok(())
    }
}

pub fn spawn_media_monitor(app_handle: AppHandle) {
    let running = Arc::new(AtomicBool::new(true));

    std::thread::Builder::new()
        .name("winisle-media-monitor".into())
        .spawn(move || {
            let mut last_info: Option<SystemMediaInfo> = None;

            while running.load(Ordering::Relaxed) {
                #[cfg(target_os = "windows")]
                {
                    if let Ok(current) = win_media::query_current_media() {
                        let should_emit = match (&last_info, &current) {
                            (None, Some(_)) => true,
                            (Some(_), None) => true,
                            (Some(a), Some(b)) => {
                                a.title != b.title
                                    || a.artist != b.artist
                                    || a.is_playing != b.is_playing
                                    || a.shuffle_active != b.shuffle_active
                                    // Or position jump > 3s
                                    || (a.position_ms as i64 - b.position_ms as i64).abs() > 3000
                            }
                            (None, None) => false,
                        };

                        if should_emit {
                            let _ = app_handle.emit("system_media_changed", &current);
                            last_info = current;
                        }
                    }
                }

                // Poll every 1000ms for responsiveness with zero CPU overhead
                std::thread::sleep(std::time::Duration::from_millis(1000));
            }
        })
        .expect("Failed to spawn system media monitor thread");
}
