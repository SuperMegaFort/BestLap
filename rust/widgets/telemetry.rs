use crate::types::TelemetryState;
use crate::widgets::theme::{
    class_color, draw_header, ACCENT_AMBER, ACCENT_CYAN, ACCENT_GREEN, ACCENT_RED, BG_ROW,
    TEXT_MUTED, TEXT_PRIMARY,
};
use egui::{Color32, CornerRadius, Frame, Margin, Pos2, Rect, RichText, Sense, Stroke, Ui, Vec2};

pub fn render_inputs(ui: &mut Ui, state: &TelemetryState, edit_mode: bool) {
    let driver_tag = state
        .active_driver()
        .map(|d| format!("#{}", d.car_number))
        .unwrap_or_else(|| "LOCAL".to_string());
    draw_header(ui, "Inputs & Pedals", &driver_tag, edit_mode);

    let inp = state.active_inputs().clone();
    ui.horizontal(|ui| {
        let gear_str = match inp.gear {
            -1 => "R".to_string(),
            0 => "N".to_string(),
            g => g.to_string(),
        };
        Frame::new()
            .fill(BG_ROW)
            .corner_radius(CornerRadius::same(6))
            .inner_margin(Margin::symmetric(12, 6))
            .show(ui, |ui| {
                ui.vertical_centered(|ui| {
                    ui.label(RichText::new(gear_str).size(26.0).strong().monospace().color(ACCENT_CYAN));
                    ui.label(
                        RichText::new(format!("{} km/h", inp.speed_kmh))
                            .size(11.0)
                            .monospace()
                            .color(TEXT_PRIMARY),
                    );
                });
            });

        ui.add_space(6.0);
        ui.vertical(|ui| {
            let bar_w = ui.available_width().max(110.0);
            for (lbl, val, col) in [
                ("THR", inp.throttle, ACCENT_GREEN),
                ("BRK", inp.brake, ACCENT_RED),
                ("CLT", inp.clutch, ACCENT_CYAN),
            ] {
                ui.horizontal(|ui| {
                    ui.label(RichText::new(lbl).size(10.0).monospace().color(TEXT_MUTED));
                    let (rect, _) = ui.allocate_exact_size(Vec2::new((bar_w - 46.0).max(40.0), 10.0), Sense::hover());
                    ui.painter().rect_filled(rect, 3.0, BG_ROW);
                    let fill = Rect::from_min_size(rect.min, Vec2::new(rect.width() * val.clamp(0.0, 1.0), rect.height()));
                    ui.painter().rect_filled(fill, 3.0, col);
                });
            }

            // RPM bar
            let max_rpm = inp.max_rpm.max(1000) as f32;
            let rpm_frac = (inp.rpm as f32 / max_rpm).clamp(0.0, 1.0);
            let rpm_col = if rpm_frac > 0.9 {
                ACCENT_RED
            } else if rpm_frac > 0.78 {
                ACCENT_AMBER
            } else {
                ACCENT_CYAN
            };
            ui.horizontal(|ui| {
                ui.label(
                    RichText::new(format!("{:>4} RPM", inp.rpm))
                        .size(10.0)
                        .monospace()
                        .color(TEXT_MUTED),
                );
                let (rect, _) = ui.allocate_exact_size(Vec2::new((bar_w - 64.0).max(40.0), 6.0), Sense::hover());
                ui.painter().rect_filled(rect, 2.0, BG_ROW);
                let fill = Rect::from_min_size(rect.min, Vec2::new(rect.width() * rpm_frac, rect.height()));
                ui.painter().rect_filled(fill, 2.0, rpm_col);
            });
        });
    });
}

pub fn render_input_graph(ui: &mut Ui, state: &TelemetryState, edit_mode: bool) {
    draw_header(ui, "Input Trace", "4s · 60 FPS", edit_mode);
    let avail = ui.available_size();
    let (rect, _) = ui.allocate_exact_size(Vec2::new(avail.x.max(120.0), avail.y.max(60.0)), Sense::hover());
    let painter = ui.painter_at(rect);
    painter.rect_filled(rect, 6.0, BG_ROW);

    for frac in [0.25_f32, 0.5, 0.75] {
        let y = rect.bottom() - rect.height() * frac;
        painter.line_segment(
            [Pos2::new(rect.left(), y), Pos2::new(rect.right(), y)],
            Stroke::new(0.8, Color32::from_rgba_premultiplied(255, 255, 255, 18)),
        );
    }

    let n = state.input_history.len();
    if n < 2 {
        return;
    }

    let max_samples = 240usize;
    let draw_curve = |extract: fn(&crate::types::InputSample) -> f32, col: Color32| {
        let mut pts = Vec::with_capacity(n);
        for (i, sample) in state.input_history.iter().enumerate() {
            let x_idx = max_samples.saturating_sub(n) + i;
            let x = rect.left() + (x_idx as f32 / (max_samples - 1) as f32) * rect.width();
            let y = rect.bottom() - extract(sample).clamp(0.0, 1.0) * (rect.height() - 6.0) - 3.0;
            pts.push(Pos2::new(x, y));
        }
        painter.add(egui::Shape::line(pts, Stroke::new(1.8, col)));
    };

    draw_curve(|s| s.clutch, ACCENT_CYAN);
    draw_curve(|s| s.brake, ACCENT_RED);
    draw_curve(|s| s.throttle, ACCENT_GREEN);
}

pub fn render_strategy(ui: &mut Ui, state: &TelemetryState, edit_mode: bool) {
    let tel = state.active_telemetry();
    let cond = format!("{} · {}% GRIP", tel.weather.condition.label(), tel.weather.grip_pct);
    draw_header(ui, "Strategy & Tires", &cond, edit_mode);

    // Fuel & Virtual Energy card
    Frame::new()
        .fill(BG_ROW)
        .corner_radius(CornerRadius::same(6))
        .inner_margin(Margin::same(8))
        .show(ui, |ui| {
            ui.horizontal(|ui| {
                ui.vertical(|ui| {
                    ui.label(RichText::new("FUEL").size(9.5).color(TEXT_MUTED));
                    ui.label(
                        RichText::new(format!("{:.1} / {:.0} L", tel.fuel.level_liters, tel.fuel.capacity_liters))
                            .size(13.5)
                            .strong()
                            .monospace()
                            .color(ACCENT_AMBER),
                    );
                });
                ui.add_space(14.0);
                ui.vertical(|ui| {
                    ui.label(RichText::new("PER LAP").size(9.5).color(TEXT_MUTED));
                    ui.label(
                        RichText::new(format!("{:.2} L", tel.fuel.per_lap_liters))
                            .size(12.5)
                            .monospace()
                            .color(TEXT_PRIMARY),
                    );
                });
                ui.add_space(14.0);
                ui.vertical(|ui| {
                    ui.label(RichText::new("VIRTUAL ENERGY").size(9.5).color(TEXT_MUTED));
                    let ve = tel
                        .fuel
                        .virtual_energy_pct
                        .map(|v| format!("{v:.1}%"))
                        .unwrap_or_else(|| "--%".to_string());
                    ui.label(
                        RichText::new(ve)
                            .size(13.5)
                            .strong()
                            .monospace()
                            .color(ACCENT_CYAN),
                    );
                });
            });
        });

    ui.add_space(6.0);

    // 4-wheel tire grid (FL, FR, RL, RR)
    egui::Grid::new("tires_grid").num_columns(2).spacing([8.0, 8.0]).show(ui, |ui| {
        for (idx, (label, corner)) in [
            ("FL", &tel.tires.fl),
            ("FR", &tel.tires.fr),
            ("RL", &tel.tires.rl),
            ("RR", &tel.tires.rr),
        ]
        .iter()
        .enumerate()
        {
            let wear = corner.wear_pct.map(|w| format!("{w:.1}%")).unwrap_or_else(|| "--%".to_string());
            let surf = corner.temp_surface_c.map(|t| format!("{t}°C")).unwrap_or_else(|| "--°".to_string());
            let core = corner.temp_core_c.map(|t| format!("Core {t}°")).unwrap_or_else(|| "Core --".to_string());
            let wear_col = match corner.wear_pct {
                Some(w) if w > 60.0 => ACCENT_GREEN,
                Some(w) if w > 30.0 => ACCENT_AMBER,
                Some(_) => ACCENT_RED,
                None => TEXT_MUTED,
            };

            Frame::new()
                .fill(BG_ROW)
                .corner_radius(CornerRadius::same(6))
                .inner_margin(Margin::same(7))
                .show(ui, |ui| {
                    ui.set_min_width(135.0);
                    ui.horizontal(|ui| {
                        ui.label(RichText::new(*label).size(10.5).strong().color(TEXT_MUTED));
                        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                            ui.label(RichText::new(wear).size(12.5).strong().monospace().color(wear_col));
                        });
                    });
                    ui.horizontal(|ui| {
                        ui.label(RichText::new(surf).size(11.0).monospace().color(TEXT_PRIMARY));
                        ui.label(RichText::new(core).size(10.0).monospace().color(TEXT_MUTED));
                    });
                });

            if idx % 2 == 1 {
                ui.end_row();
            }
        }
    });

    ui.add_space(6.0);
    ui.horizontal(|ui| {
        ui.label(
            RichText::new(format!(
                "TRK {}°C   AIR {}°C   HUM {}%",
                tel.weather.track_temp_c, tel.weather.air_temp_c, tel.weather.humidity_pct
            ))
            .size(10.5)
            .monospace()
            .color(TEXT_MUTED),
        );
    });
}

pub fn render_trackmap(ui: &mut Ui, state: &TelemetryState, edit_mode: bool) {
    draw_header(ui, "Track Map", &state.session.track_name, edit_mode);
    let avail = ui.available_size();
    let (rect, _) = ui.allocate_exact_size(Vec2::new(avail.x.max(120.0), avail.y.max(120.0)), Sense::hover());
    let painter = ui.painter_at(rect);
    painter.rect_filled(rect, 6.0, BG_ROW);

    if state.track_map_points.len() < 3 {
        painter.text(
            rect.center(),
            egui::Align2::CENTER_CENTER,
            "Waiting for track geometry...",
            egui::FontId::proportional(11.5),
            TEXT_MUTED,
        );
        return;
    }

    let (mut min_x, mut max_x, mut min_z, mut max_z) = (f32::MAX, f32::MIN, f32::MAX, f32::MIN);
    for p in &state.track_map_points {
        min_x = min_x.min(p.x);
        max_x = max_x.max(p.x);
        min_z = min_z.min(p.z);
        max_z = max_z.max(p.z);
    }

    let span_x = (max_x - min_x).max(1.0);
    let span_z = (max_z - min_z).max(1.0);
    let pad = 16.0;
    let scale = ((rect.width() - pad * 2.0) / span_x).min((rect.height() - pad * 2.0) / span_z);
    let offset_x = rect.center().x - ((min_x + max_x) * 0.5) * scale;
    let offset_y = rect.center().y - ((min_z + max_z) * 0.5) * scale;

    let to_screen = |wx: f32, wz: f32| Pos2::new(offset_x + wx * scale, offset_y + wz * scale);

    let mut path_pts: Vec<Pos2> = state
        .track_map_points
        .iter()
        .map(|p| to_screen(p.x, p.z))
        .collect();
    if let Some(&first) = path_pts.first() {
        path_pts.push(first);
    }

    painter.add(egui::Shape::line(
        path_pts.clone(),
        Stroke::new(6.0, Color32::from_rgba_premultiplied(255, 255, 255, 26)),
    ));
    painter.add(egui::Shape::line(
        path_pts,
        Stroke::new(2.0, Color32::from_rgb(148, 163, 184)),
    ));

    // Draw drivers
    let n_pts = state.track_map_points.len();
    for entry in &state.standings {
        let pos = if entry.world_x.abs() > 0.5 || entry.world_z.abs() > 0.5 {
            to_screen(entry.world_x as f32, entry.world_z as f32)
        } else {
            let idx = ((entry.lap_distance_pct * n_pts as f64) as usize) % n_pts;
            let p = state.track_map_points[idx];
            to_screen(p.x, p.z)
        };

        let col = if entry.is_player {
            ACCENT_AMBER
        } else {
            class_color(entry.car_class)
        };
        let radius = if entry.is_player { 6.0 } else { 4.2 };
        painter.circle_filled(pos, radius, col);
        if entry.is_player {
            painter.circle_stroke(pos, 7.5, Stroke::new(1.5, TEXT_PRIMARY));
        }
    }
}
