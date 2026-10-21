use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_deep_link::init())
        // Single-instance with the `deep-link` cargo feature (see Cargo.toml).
        // Canonical scheme is `teal://vestara-shell/<route>` — pinned by the
        // frontend constants `DEEP_LINK_SCHEME` (`teal`) and `DEEP_LINK_HOST`
        // (`vestara-shell`) in `src/features/desktop-shell/deep-link.ts`
        // (guarded by `deep-link.test.ts`). Do not rename without updating
        // `tauri.conf.json` (`plugins.deep-link.desktop.schemes`) in lockstep.
        // On Windows/Linux the OS spawns a second instance with the
        // `teal://vestara-shell/...` URL as argv. The plugin forwards that URL
        // through the deep-link plugin (`deep-link://new-url`, observed by the
        // frontend `onOpenUrl` listener) before invoking this callback, so the
        // running-app case needs no manual re-emit here — only bring the
        // existing main window forward.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .run(tauri::generate_context!())
        .expect("error while running Vestara Workspace desktop shell");
}
