#[cfg(target_os = "macos")]
use std::sync::mpsc;

#[cfg(target_os = "macos")]
use objc2::MainThreadMarker;
#[cfg(target_os = "macos")]
use objc2_app_kit::{NSModalResponseOK, NSOpenPanel};

/// Present an AppKit NSOpenPanel that allows choosing either a file or a folder
/// (or confirming the current directory). Tauri-plugin-dialog and rfd only expose
/// separate file and directory pickers, so a tiny custom command is required for
/// the unified "Open" action on macOS.
#[cfg(target_os = "macos")]
#[tauri::command]
async fn pick_file_or_folder(app: tauri::AppHandle) -> Option<String> {
  let (tx, rx) = mpsc::channel::<Option<String>>();
  app
    .run_on_main_thread(move || {
      let result = (|| {
        // NSOpenPanel must run on the main thread; unwrap is safe because
        // run_on_main_thread guarantees we are on the main thread.
        let mtm = MainThreadMarker::new()?;
        let panel = NSOpenPanel::openPanel(mtm);
        panel.setCanChooseFiles(true);
        panel.setCanChooseDirectories(true);
        panel.setAllowsMultipleSelection(false);
        if panel.runModal() != NSModalResponseOK {
          return None;
        }
        let url = panel.URLs().firstObject()?;
        let path = url.path()?;
        Some(path.to_string())
      })();
      let _ = tx.send(result);
    })
    .ok()?;
  rx.recv().ok().flatten()
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
async fn pick_file_or_folder() -> Option<String> {
  None
}

pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .invoke_handler(tauri::generate_handler![pick_file_or_folder])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
