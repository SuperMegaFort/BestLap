use std::fs;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};

pub const LMU_APP_ID: &str = "2399420";

pub fn find_steam_root() -> Option<PathBuf> {
    let home = dirs::home_dir()?;
    let candidates = [
        home.join(".steam/steam"),
        home.join(".local/share/Steam"),
        home.join(".var/app/com.valvesoftware.Steam/.local/share/Steam"),
    ];
    candidates.into_iter().find(|p| p.exists())
}

pub fn find_lmu_proton_binary(steam_root: &PathBuf) -> Option<PathBuf> {
    let compat_dir = steam_root.join("steamapps/compatdata").join(LMU_APP_ID);
    let config_info = compat_dir.join("config_info");
    if let Ok(content) = fs::read_to_string(&config_info) {
        for raw_line in content.lines() {
            let line = raw_line.trim();
            let cut = line.find("/files/").or_else(|| line.find("/dist/"));
            if let Some(idx) = cut {
                let candidate = PathBuf::from(&line[..idx]).join("proton");
                if candidate.exists() {
                    return Some(candidate);
                }
            }
        }
    }

    let version_file = compat_dir.join("version");
    if let Ok(ver) = fs::read_to_string(&version_file) {
        let ver = ver.trim();
        if !ver.is_empty() {
            let mut candidates = vec![
                steam_root.join("compatibilitytools.d").join(ver).join("proton"),
                steam_root.join("steamapps/common").join(ver).join("proton"),
            ];
            if let Some(home) = dirs::home_dir() {
                candidates.push(home.join(".local/share/Steam/compatibilitytools.d").join(ver).join("proton"));
            }
            for c in candidates {
                if c.exists() {
                    return Some(c);
                }
            }
        }
    }

    None
}

pub struct ProtonBridgeGuard {
    child: Option<Child>,
    attempted: bool,
}

impl Default for ProtonBridgeGuard {
    fn default() -> Self {
        Self {
            child: None,
            attempted: false,
        }
    }
}

impl ProtonBridgeGuard {
    pub fn ensure_running(&mut self) {
        if self.child.is_some() || self.attempted {
            return;
        }
        self.attempted = true;

        let bridge_exe = PathBuf::from("bridge/lmu_shm_bridge.exe");
        if !bridge_exe.exists() {
            return;
        }
        let Some(steam_root) = find_steam_root() else {
            return;
        };
        let Some(proton_bin) = find_lmu_proton_binary(&steam_root) else {
            return;
        };
        let compat_dir = steam_root.join("steamapps/compatdata").join(LMU_APP_ID);

        if let Ok(child) = Command::new(&proton_bin)
            .arg("run")
            .arg(&bridge_exe)
            .env("STEAM_COMPAT_DATA_PATH", &compat_dir)
            .env("STEAM_COMPAT_CLIENT_INSTALL_PATH", &steam_root)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
        {
            eprintln!("[BestLap Rust] Auto-started Proton 60Hz SHM bridge");
            self.child = Some(child);
        }
    }

    pub fn stop(&mut self) {
        self.attempted = false;
        if let Some(mut child) = self.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

impl Drop for ProtonBridgeGuard {
    fn drop(&mut self) {
        self.stop();
    }
}
