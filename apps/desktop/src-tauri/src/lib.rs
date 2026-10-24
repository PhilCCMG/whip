//! WHIP desktop shell (ADR-0011, docs/architecture/08-desktop.md).
//!
//! A thin Tauri v2 host around the bundled SPA. All game data comes from the cloud API; the Rust
//! side only owns what a browser can't do: the OS credential store for the session token,
//! fullscreen, single instance, window-state persistence, signed auto-updates and opening
//! allowlisted https links in the system browser.

mod session;

use std::time::Duration;

use tauri::{Manager, WebviewWindow};
use tauri_plugin_window_state::StateFlags;

/// The window starts hidden (no white or half-painted frame) and is shown when the SPA paints its
/// first boot-splash frame (`whip:boot-ready`, see shell.js), or after this fallback regardless.
const SHOW_FALLBACK: Duration = Duration::from_secs(3);

/// Keyboard + context-menu handling injected into every page before the SPA runs.
/// `__WHIP_RELEASE__` is replaced at compile time.
const SHELL_SCRIPT: &str = include_str!("shell.js");

/// Toggles borderless fullscreen on the calling window. Returns the new state.
#[tauri::command]
fn toggle_fullscreen(window: WebviewWindow) -> Result<bool, String> {
    let next = !window.is_fullscreen().map_err(|e| e.to_string())?;
    window.set_fullscreen(next).map_err(|e| e.to_string())?;
    if !next {
        // Leaving fullscreen should land back on a usable window, not a tiny restored one.
        let _ = window.set_focus();
    }
    Ok(next)
}

/// Shows the main window (idempotent). Called by shell.js on `whip:boot-ready`.
#[tauri::command]
fn show_main_window(app: tauri::AppHandle) {
    focus_main(&app);
}

fn focus_main(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let script = SHELL_SCRIPT.replace(
        "__WHIP_RELEASE__",
        if cfg!(debug_assertions) {
            "false"
        } else {
            "true"
        },
    );

    tauri::Builder::default()
        // Must be registered first: a second launch focuses the running game and exits.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            focus_main(app)
        }))
        // Restore size/position/maximized/fullscreen, but never visibility: we show the window ourselves.
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(StateFlags::all() & !StateFlags::VISIBLE)
                .build(),
        )
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri::plugin::Builder::<tauri::Wry, ()>::new("whip-shell")
                .js_init_script(script)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            toggle_fullscreen,
            show_main_window,
            session::session_token_get,
            session::session_token_set,
            session::session_token_clear,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(SHOW_FALLBACK);
                if let Some(w) = handle.get_webview_window("main") {
                    if !w.is_visible().unwrap_or(true) {
                        focus_main(&handle);
                    }
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running WHIP");
}
