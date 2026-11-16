use crate::types::{PitStatus, StandingsEntry, TelemetryState, VehicleClass};
use crate::widgets::theme::{
    class_color, draw_header, format_lap_ms, format_time_sec, tire_color, ACCENT_AMBER,
    ACCENT_CYAN, ACCENT_GREEN, ACCENT_PURPLE, ACCENT_RED, BG_ROW, BG_ROW_ALT, TEXT_MUTED,
    TEXT_PRIMARY,
};
use egui::{Color32, CornerRadius, Frame, Margin, RichText, Sense, Stroke, Ui};
use std::collections::BTreeMap;

fn class_order(cls: VehicleClass) -> u8 {
    match cls {
        VehicleClass::Hypercar => 0,
        VehicleClass::Lmp2 => 1,
        VehicleClass::Lmp3 => 2,
        VehicleClass::Gte => 3,
        VehicleClass::Lmgt3 => 4,
        VehicleClass::Unknown => 5,
    }
}

pub fn render_leaderboard(ui: &mut Ui, state: &mut TelemetryState, edit_mode: bool) {
    let right = format!(
        "{} · {} · {}",
        state.session.session_type,
        format_time_sec(state.session.time_remaining_sec),
        state.standings.len()
    );
    draw_header(ui, "Leaderboard", &right, edit_mode);

    if state.standings.is_empty() {
        ui.label(RichText::new(&state.status_message).size(11.5).color(TEXT_MUTED));
        return;
    }

    let mut groups: BTreeMap<u8, Vec<&StandingsEntry>> = BTreeMap::new();
    for entry in &state.standings {
        groups.entry(class_order(entry.car_class)).or_default().push(entry);
    }

    let focused_id = state.focused_driver_id.clone();
    let mut clicked_id: Option<String> = None;

    egui::ScrollArea::vertical().auto_shrink([false, false]).show(ui, |ui| {
        for (_ord, rows) in groups {
            let cls = rows[0].car_class;
            let cls_col = class_color(cls);

            Frame::new()
                .fill(Color32::from_rgba_premultiplied(cls_col.r(), cls_col.g(), cls_col.b(), 36))
                .corner_radius(CornerRadius::same(4))
                .inner_margin(Margin::symmetric(6, 2))
                .show(ui, |ui| {
                    ui.horizontal(|ui| {
                        ui.label(RichText::new(cls.label()).size(10.5).strong().color(cls_col));
                        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                            ui.label(
                                RichText::new(format!("{} cars", rows.len()))
                                    .size(10.0)
                                    .color(TEXT_MUTED),
                            );
                        });
                    });
                });

            ui.add_space(2.0);

            for (idx, row) in rows.iter().enumerate() {
                let is_focused = focused_id.as_ref() == Some(&row.id)
                    || (focused_id.is_none() && row.is_player);
                let bg = if idx % 2 == 0 { BG_ROW } else { BG_ROW_ALT };
                let stroke = if is_focused {
                    Stroke::new(1.2, ACCENT_CYAN)
                } else {
                    Stroke::NONE
                };

                let resp = Frame::new()
                    .fill(bg)
                    .stroke(stroke)
                    .corner_radius(CornerRadius::same(4))
                    .inner_margin(Margin::symmetric(6, 3))
                    .show(ui, |ui| {
                        ui.horizontal(|ui| {
                            ui.set_min_width(ui.available_width());
                            ui.label(
                                RichText::new(format!("{:>2}", row.class_position))
                                    .size(11.0)
                                    .monospace()
                                    .strong()
                                    .color(TEXT_PRIMARY),
                            );

                            Frame::new()
                                .fill(cls_col)
                                .corner_radius(CornerRadius::same(3))
                                .inner_margin(Margin::symmetric(4, 1))
                                .show(ui, |ui| {
                                    ui.label(
                                        RichText::new(format!("#{}", row.car_number))
                                            .size(9.5)
                                            .strong()
                                            .color(Color32::BLACK),
                                    );
                                });

                            let name_col = if row.is_player { ACCENT_AMBER } else { TEXT_PRIMARY };
                            let short_name: String = row.driver_name.chars().take(16).collect();
                            ui.label(RichText::new(short_name).size(11.0).color(name_col));

                            if row.pit_status != PitStatus::OnTrack {
                                let p_lbl = if row.pit_status == PitStatus::Garage { "GAR" } else { "PIT" };
                                ui.label(RichText::new(p_lbl).size(9.5).strong().color(ACCENT_AMBER));
                            }

                            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                                let last_col = if row.is_class_best {
                                    ACCENT_PURPLE
                                } else if row.is_personal_best {
                                    ACCENT_GREEN
                                } else {
                                    TEXT_PRIMARY
                                };
                                ui.label(
                                    RichText::new(format_lap_ms(row.last_lap_ms))
                                        .size(10.5)
                                        .monospace()
                                        .color(last_col),
                                );

                                let int_str = row
                                    .interval_sec
                                    .map(|v| format!("{v:.1}"))
                                    .unwrap_or_else(|| "-".to_string());
                                ui.label(
                                    RichText::new(format!("{int_str:>5}"))
                                        .size(10.5)
                                        .monospace()
                                        .color(TEXT_MUTED),
                                );

                                if let Some(ve) = row.energy_pct {
                                    ui.label(
                                        RichText::new(format!("{ve:.0}%"))
                                            .size(10.0)
                                            .monospace()
                                            .color(ACCENT_CYAN),
                                    );
                                }

                                ui.label(
                                    RichText::new(row.tire_compound.short_code())
                                        .size(10.0)
                                        .strong()
                                        .monospace()
                                        .color(tire_color(row.tire_compound)),
                                );

                                ui.label(
                                    RichText::new(format!("L{}", row.lap))
                                        .size(10.0)
                                        .monospace()
                                        .color(TEXT_MUTED),
                                );

                                if row.position_gain > 0 {
                                    ui.label(
                                        RichText::new(format!("▲{}", row.position_gain))
                                            .size(9.5)
                                            .color(ACCENT_GREEN),
                                    );
                                } else if row.position_gain < 0 {
                                    ui.label(
                                        RichText::new(format!("▼{}", row.position_gain.abs()))
                                            .size(9.5)
                                            .color(ACCENT_RED),
                                    );
                                }
                            });
                        });
                    })
                    .response;

                if resp.interact(Sense::click()).clicked() {
                    clicked_id = Some(row.id.clone());
                }
                ui.add_space(2.0);
            }
            ui.add_space(4.0);
        }
    });

    if let Some(id) = clicked_id {
        if state.focused_driver_id.as_ref() == Some(&id) {
            state.focused_driver_id = None;
        } else {
            state.focused_driver_id = Some(id);
        }
    }
}

pub fn render_relative(ui: &mut Ui, state: &mut TelemetryState, edit_mode: bool) {
    draw_header(ui, "Relative", "On Track", edit_mode);
    let Some(active) = state.active_driver().cloned() else {
        ui.label(RichText::new("No active driver").size(11.0).color(TEXT_MUTED));
        return;
    };

    let mut rel_rows: Vec<(f64, &StandingsEntry)> = state
        .standings
        .iter()
        .map(|e| {
            let mut diff = e.lap_distance_pct - active.lap_distance_pct;
            if diff > 0.5 {
                diff -= 1.0;
            } else if diff < -0.5 {
                diff += 1.0;
            }
            (diff * 200.0, e)
        })
        .collect();

    rel_rows.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    let center_idx = rel_rows
        .iter()
        .position(|(_, e)| e.id == active.id)
        .unwrap_or(0);
    let start = center_idx.saturating_sub(3);
    let end = (center_idx + 4).min(rel_rows.len());

    let mut clicked_id: Option<String> = None;
    for (idx, (delta_s, row)) in rel_rows[start..end].iter().enumerate() {
        let is_focus = row.id == active.id;
        let bg = if idx % 2 == 0 { BG_ROW } else { BG_ROW_ALT };
        let resp = Frame::new()
            .fill(bg)
            .stroke(if is_focus {
                Stroke::new(1.2, ACCENT_CYAN)
            } else {
                Stroke::NONE
            })
            .corner_radius(CornerRadius::same(4))
            .inner_margin(Margin::symmetric(6, 3))
            .show(ui, |ui| {
                ui.horizontal(|ui| {
                    ui.set_min_width(ui.available_width());
                    ui.label(
                        RichText::new(format!("P{}", row.class_position))
                            .size(10.5)
                            .monospace()
                            .color(class_color(row.car_class)),
                    );
                    ui.label(
                        RichText::new(format!("#{}", row.car_number))
                            .size(10.5)
                            .monospace()
                            .color(TEXT_MUTED),
                    );
                    let short: String = row.driver_name.chars().take(15).collect();
                    ui.label(
                        RichText::new(short)
                            .size(11.0)
                            .color(if is_focus { ACCENT_AMBER } else { TEXT_PRIMARY }),
                    );
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        let d_col = if *delta_s > 0.05 {
                            ACCENT_RED
                        } else if *delta_s < -0.05 {
                            ACCENT_CYAN
                        } else {
                            TEXT_PRIMARY
                        };
                        ui.label(
                            RichText::new(format!("{delta_s:+.1}s"))
                                .size(11.0)
                                .monospace()
                                .color(d_col),
                        );
                    });
                });
            })
            .response;

        if resp.interact(Sense::click()).clicked() {
            clicked_id = Some(row.id.clone());
        }
        ui.add_space(2.0);
    }

    if let Some(id) = clicked_id {
        state.focused_driver_id = Some(id);
    }
}
