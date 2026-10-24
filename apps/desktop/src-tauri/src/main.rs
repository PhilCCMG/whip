// No console window behind the game on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    whip_desktop_lib::run()
}
