#[cfg_attr(mobile, tauri::mobile_entry_point)]
use std::sync::Mutex;
use tauri::{State, Manager};
mod db;
use db::Db;

pub struct AppState {
    db: Mutex<Db>,
}

#[tauri::command]
fn create_entry(state: State<AppState>, onecard: i32, name: String) -> Result<(), String> {
    state.db.lock().unwrap().insert(onecard, Some(&name)).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_anonymous(state: State<AppState>) -> Result<(), String> {
    state.db.lock().unwrap().insert(1000001, None).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_entries(state: State<AppState>) -> Result<Vec<db::GuestEntry>, String> {
    state.db.lock().unwrap().all().map_err(|e| e.to_string())
}

#[tauri::command]
fn flush_entries(state: State<AppState>) -> Result<(), String> {
    state.db.lock().unwrap().flush().map_err(|e| e.to_string())
}

pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      let path = app.path_resolver().app_data_dir().unwrap().join("guestbook.db");
      let db = Db::new(path.to_str().unwrap()).map_err(|e| e.to_string())?;
      app.manage(AppState{ db: Mutex::new(db) });
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![create_entry, create_anonymous, get_entries, flush_entries])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
