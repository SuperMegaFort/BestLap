use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WidgetConfig {
    pub id: String,
    pub title: String,
    pub enabled: bool,
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    pub min_width: f32,
    pub min_height: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LayoutConfig {
    pub version: u32,
    pub widgets: BTreeMap<String, WidgetConfig>,
}

impl Default for LayoutConfig {
    fn default() -> Self {
        let mut widgets = BTreeMap::new();
        let defs = [
            ("leaderboard", "Leaderboard", true, 24.0, 24.0, 520.0, 480.0, 420.0, 220.0),
            ("relative", "Relative", true, 24.0, 820.0, 420.0, 230.0, 320.0, 160.0),
            ("inputs", "Inputs & Pedals", true, 24.0, 520.0, 340.0, 140.0, 240.0, 110.0),
            ("input-graph", "Input Trace (4s)", true, 24.0, 672.0, 380.0, 136.0, 260.0, 100.0),
            ("strategy", "Strategy & Tires", true, 1480.0, 24.0, 400.0, 320.0, 320.0, 240.0),
            ("trackmap", "Track Map", true, 1480.0, 360.0, 400.0, 320.0, 220.0, 200.0),
            ("radar", "Proximity Radar", true, 840.0, 640.0, 240.0, 240.0, 180.0, 180.0),
            ("delta", "Delta & Sectors", true, 760.0, 24.0, 380.0, 110.0, 280.0, 90.0),
            ("gforce", "G-Force Circle", false, 1120.0, 640.0, 190.0, 190.0, 150.0, 150.0),
            ("electronics", "Electronics & Flags", false, 760.0, 148.0, 380.0, 88.0, 280.0, 72.0),
        ];

        for (id, title, enabled, x, y, width, height, min_width, min_height) in defs {
            widgets.insert(
                id.to_string(),
                WidgetConfig {
                    id: id.to_string(),
                    title: title.to_string(),
                    enabled,
                    x,
                    y,
                    width,
                    height,
                    min_width,
                    min_height,
                },
            );
        }

        Self { version: 2, widgets }
    }
}

impl LayoutConfig {
    pub fn config_path() -> PathBuf {
        dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("bestlap")
            .join("rust-layout.json")
    }

    pub fn load_or_default() -> Self {
        let path = Self::config_path();
        if let Ok(raw) = fs::read_to_string(&path) {
            if let Ok(mut parsed) = serde_json::from_str::<Self>(&raw) {
                let defaults = Self::default();
                for (id, def) in defaults.widgets {
                    parsed.widgets.entry(id).or_insert(def);
                }
                return parsed;
            }
        }
        Self::default()
    }

    pub fn save(&self) {
        let path = Self::config_path();
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(json) = serde_json::to_string_pretty(self) {
            let _ = fs::write(path, json);
        }
    }
}
