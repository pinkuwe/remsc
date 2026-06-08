//! RE:MUSIC paths and folder names (filesystem-safe: no colon in directory names).

/// Main music library folder next to the app / project root (used by `remsc-launch`).
#[allow(dead_code)]
pub const MUSIC_DIR: &str = "RE-MUSIC";

/// Hidden cache directory inside the music library root.
pub const CACHE_DIR: &str = ".re-music";
