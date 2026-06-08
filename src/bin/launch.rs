//! Double-click launcher for RE:MUSIC: starts the server and opens the browser.

use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::Duration;

use anyhow::{bail, Context, Result};
use remsc::branding;
use remsc::net;
use walkdir::WalkDir;

const PORT: u16 = 8080;
const AUDIO_EXT: &[&str] = &["mp3", "flac", "m4a", "ogg", "opus", "wav", "aac", "wma"];

fn main() -> Result<()> {
    let base = exe_dir()?;
    let remsc = find_remsc(&base)?;
    let music = find_music_dir(&base)?;
    let track_count = count_audio_files(&music);

    let lan_host = net::pick_lan_ipv4().unwrap_or_else(|| "127.0.0.1".to_string());
    let local_url = net::ui_url("127.0.0.1", PORT);
    let lan_url = net::ui_url(&lan_host, PORT);
    let public_url = net::normalize_base(&format!("http://{lan_host}:{PORT}"));

    println!("========================================");
    println!("  RE:MUSIC — локальный музыкальный сервер");
    println!("========================================");
    println!();
    println!("Папка с музыкой: {}", music.display());
    if track_count == 0 {
        println!();
        println!("  ⚠ В папке нет аудиофайлов (mp3, flac, m4a, …).");
        println!("    Положите музыку в: {}", music.display());
        println!("    и перезапустите программу.");
    } else {
        println!("Найдено файлов:   {track_count}");
    }
    println!("На этом ПК:       {local_url}");
    if lan_host != "127.0.0.1" {
        println!("В Wi‑Fi (телефон): {lan_url}");
    }
    println!();
    println!("Запуск сервера… (закройте это окно для остановки)");
    println!();

    let mut child = Command::new(&remsc)
        .current_dir(base.as_path())
        .arg("serve")
        .arg(&music)
        .arg("--bind")
        .arg("0.0.0.0")
        .arg("--port")
        .arg(PORT.to_string())
        .arg("--public-url")
        .arg(&public_url)
        .arg("--qr")
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .spawn()
        .with_context(|| format!("не удалось запустить {}", remsc.display()))?;

    thread::sleep(Duration::from_millis(1500));

    if let Err(err) = open::that(&local_url) {
        eprintln!("Не удалось открыть браузер: {err}");
        eprintln!("Откройте вручную: {local_url}");
    }

    let status = child
        .wait()
        .context("ожидание завершения сервера")?;
    if !status.success() {
        bail!("сервер завершился с кодом {}", status);
    }
    Ok(())
}

fn exe_dir() -> Result<PathBuf> {
    let exe = env::current_exe().context("путь к программе")?;
    exe.parent()
        .map(Path::to_path_buf)
        .context("каталог программы")
}

fn find_remsc(base: &Path) -> Result<PathBuf> {
    let candidates = [
        base.join(if cfg!(windows) {
            "remsc.exe"
        } else {
            "remsc"
        }),
        base.join("target/release").join(if cfg!(windows) {
            "remsc.exe"
        } else {
            "remsc"
        }),
        base.join("target/debug").join(if cfg!(windows) {
            "remsc.exe"
        } else {
            "remsc"
        }),
    ];
    for path in candidates {
        if path.is_file() {
            return Ok(path);
        }
    }
    bail!(
        "не найден remsc.exe рядом с программой.\n\
         Соберите проект: cargo build --release\n\
         и положите remsc-launch.exe и remsc.exe в одну папку."
    );
}

fn find_music_dir(exe_base: &Path) -> Result<PathBuf> {
    let names = [branding::MUSIC_DIR, "demo-music", "music"];
    let mut search = exe_base.to_path_buf();
    let mut found_empty: Option<PathBuf> = None;

    for _ in 0..8 {
        for name in names {
            let dir = search.join(name);
            if !dir.is_dir() {
                continue;
            }
            let resolved = fs::canonicalize(&dir).unwrap_or(dir);
            if count_audio_files(&resolved) > 0 {
                return Ok(resolved);
            }
            if found_empty.is_none() {
                found_empty = Some(resolved);
            }
        }
        if !search.pop() {
            break;
        }
    }

    if let Some(dir) = found_empty {
        return Ok(dir);
    }

    let demo = exe_base.join(branding::MUSIC_DIR);
    fs::create_dir_all(&demo).context("создание папки RE-MUSIC")?;
    let hint = demo.join("ПОЛОЖИТЕ_СЮДА_MP3.txt");
    if !hint.exists() {
        fs::write(
            &hint,
            "Положите сюда файлы mp3, flac, m4a, ogg и перезапустите RE:MUSIC.\n",
        )?;
    }
    Ok(fs::canonicalize(&demo).unwrap_or(demo))
}

fn count_audio_files(dir: &Path) -> usize {
    WalkDir::new(dir)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter(|e| {
            e.path()
                .extension()
                .and_then(|s| s.to_str())
                .is_some_and(|ext| AUDIO_EXT.iter().any(|&a| ext.eq_ignore_ascii_case(a)))
        })
        .count()
}
