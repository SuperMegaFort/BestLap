use crate::types::{TireCompound, VehicleClass};
use egui::{Color32, CornerRadius, Frame, Margin, Stroke, Ui};

pub const BG_PANEL: Color32 = Color32::from_rgba_premultiplied(11, 14, 20, 228);
pub const BG_ROW: Color32 = Color32::from_rgba_premultiplied(20, 25, 34, 200);
pub const BG_ROW_ALT: Color32 = Color32::from_rgba_premultiplied(15, 19, 27, 200);
pub const BORDER_SUBTLE: Color32 = Color32::from_rgba_premultiplied(255, 255, 255, 28);
pub const BORDER_EDIT: Color32 = Color32::from_rgb(56, 189, 248);
pub const TEXT_PRIMARY: Color32 = Color32::from_rgb(241, 245, 249);
pub const TEXT_MUTED: Color32 = Color32::from_rgb(148, 163, 184);
pub const ACCENT_CYAN: Color32 = Color32::from_rgb(34, 211, 238);
pub const ACCENT_GREEN: Color32 = Color32::from_rgb(34, 197, 94);
pub const ACCENT_RED: Color32 = Color32::from_rgb(239, 68, 68);
pub const ACCENT_AMBER: Color32 = Color32::from_rgb(245, 158, 11);
pub const ACCENT_PURPLE: Color32 = Color32::from_rgb(192, 132, 252);

pub fn class_color(cls: VehicleClass) -> Color32 {
    match cls {
        VehicleClass::Hypercar => Color32::from_rgb(239, 68, 68),
        VehicleClass::Lmp2 => Color32::from_rgb(59, 130, 246),
        VehicleClass::Lmp3 => Color32::from_rgb(168, 85, 247),
        VehicleClass::Lmgt3 => Color32::from_rgb(245, 158, 11),
        VehicleClass::Gte => Color32::from_rgb(16, 185, 129),
        VehicleClass::Unknown => Color32::from_rgb(100, 116, 139),
    }
}

pub fn tire_color(comp: TireCompound) -> Color32 {
    match comp {
        TireCompound::Soft => ACCENT_RED,
        TireCompound::Medium => ACCENT_AMBER,
        TireCompound::Hard => TEXT_PRIMARY,
        TireCompound::Wet => ACCENT_CYAN,
        TireCompound::Unknown => TEXT_MUTED,
    }
}

pub fn format_lap_ms(ms: Option<i64>) -> String {
    let Some(ms) = ms else {
        return "-:--.---".to_string();
    };
    if ms <= 0 {
        return "-:--.---".to_string();
    }
    let total_secs = ms / 1000;
    let mins = total_secs / 60;
    let secs = total_secs % 60;
    let millis = ms % 1000;
    format!("{mins}:{secs:02}.{millis:03}")
}

pub fn format_time_sec(sec: Option<f64>) -> String {
    let Some(s) = sec else {
        return "--:--".to_string();
    };
    let s = s.max(0.0).round() as i64;
    let h = s / 3600;
    let m = (s % 3600) / 60;
    let rem = s % 60;
    if h > 0 {
        format!("{h}:{m:02}:{rem:02}")
    } else {
        format!("{m:02}:{rem:02}")
    }
}

pub fn widget_frame(edit_mode: bool) -> Frame {
    Frame::new()
        .fill(BG_PANEL)
        .stroke(Stroke::new(
            if edit_mode { 1.5 } else { 1.0 },
            if edit_mode { BORDER_EDIT } else { BORDER_SUBTLE },
        ))
        .corner_radius(CornerRadius::same(8))
        .inner_margin(Margin::same(10))
}

pub fn draw_header(ui: &mut Ui, title: &str, right_text: &str, edit_mode: bool) {
    ui.horizontal(|ui| {
        ui.label(
            egui::RichText::new(title.to_uppercase())
                .size(11.0)
                .strong()
                .color(if edit_mode { BORDER_EDIT } else { ACCENT_CYAN }),
        );
        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
            ui.label(
                egui::RichText::new(right_text)
                    .size(10.5)
                    .monospace()
                    .color(TEXT_MUTED),
            );
        });
    });
    ui.add_space(4.0);
}
