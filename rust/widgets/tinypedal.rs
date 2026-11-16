use crate::types::TelemetryState;
use crate::widgets::theme::{
    class_color, draw_header, format_lap_ms, ACCENT_AMBER, ACCENT_CYAN, ACCENT_GREEN, ACCENT_RED,
    BG_ROW, TEXT_MUTED, TEXT_PRIMARY,
};
use egui::{Color32, CornerRadius, Frame, Margin, Pos2, Rect, RichText, Sense, Stroke, Ui, Vec2};

pub fn render_radar(ui: &mut Ui, state: &TelemetryState, edit_mode: bool) {
    draw_header(ui, "Proximity Radar", "30m", edit_mode);
    let avail = ui.available_size();
    let side = avail.x.min(avail.y).max(110.0);
    let (rect, _) = ui.allocate_exact_size(Vec2::new(avail.x.max(110.0), side), Sense::hover());
    let painter = ui.painter_at(rect);
    let center = rect.center();
    let radius = side * 0.45;

    painter.circle_filled(center, radius, BG_ROW);
    painter.circle_stroke(center, radius, Stroke::new(1.0, Color32::from_rgba_premultiplied(255, 255, 255, 24)));
    painter.circle_stroke(center, radius * 0.5, Stroke::new(0.8, Color32::from_rgba_premultiplied(255, 255, 255, 16)));
    painter.line_segment(
        [Pos2::new(center.x - radius, center.y), Pos2::new(center.x + radius, center.y)],
        Stroke::new(0.6, Color32::from_rgba_premultiplied(255, 255, 255, 16)),
    );
    painter.line_segment(
        [Pos2::new(center.x, center.y - radius), Pos2::new(center.x, center.y + radius)],
        Stroke::new(0.6, Color32::from_rgba_premultiplied(255, 255, 255, 16)),
    );

    // Player car rectangle in center
    let car_size = Vec2::new(10.0, 20.0);
    painter.rect_filled(Rect::from_center_size(center, car_size), 2.0, ACCENT_RED);

    let Some(player) = state.active_driver() else {
        return;
    };

    let mut warn_left = false;
    let mut warn_right = false;
    let range_m = 28.0_f32;

    for other in &state.standings {
        if other.id == player.id {
            continue;
        }
        let dx = (other.world_x - player.world_x) as f32;
        let dz = (other.world_z - player.world_z) as f32;
        let dist = (dx * dx + dz * dz).sqrt();
        if dist > range_m || dist < 0.1 {
            continue;
        }
        let sx = center.x + (dx / range_m) * radius;
        let sy = center.y + (dz / range_m) * radius;
        if dx < -0.5 && dist < 8.0 {
            warn_left = true;
        }
        if dx > 0.5 && dist < 8.0 {
            warn_right = true;
        }
        let col = if dist < 6.0 { ACCENT_AMBER } else { class_color(other.car_class) };
        painter.rect_filled(Rect::from_center_size(Pos2::new(sx, sy), Vec2::new(9.0, 18.0)), 2.0, col);
    }

    if warn_left {
        painter.rect_filled(
            Rect::from_min_max(Pos2::new(rect.left() + 4.0, center.y - 28.0), Pos2::new(rect.left() + 9.0, center.y + 28.0)),
            2.0,
            ACCENT_AMBER,
        );
    }
    if warn_right {
        painter.rect_filled(
            Rect::from_min_max(Pos2::new(rect.right() - 9.0, center.y - 28.0), Pos2::new(rect.right() - 4.0, center.y + 28.0)),
            2.0,
            ACCENT_AMBER,
        );
    }
}

pub fn render_delta(ui: &mut Ui, state: &TelemetryState, edit_mode: bool) {
    draw_header(ui, "Delta & Timing", "Live", edit_mode);
    let delta = state.live_delta_sec;
    let bar_w = ui.available_width().max(120.0);
    let (rect, _) = ui.allocate_exact_size(Vec2::new(bar_w, 14.0), Sense::hover());
    let painter = ui.painter_at(rect);
    painter.rect_filled(rect, 4.0, BG_ROW);

    let mid = rect.center().x;
    let norm = (delta / 2.0).clamp(-1.0, 1.0);
    let fill_col = if delta <= 0.0 { ACCENT_GREEN } else { ACCENT_RED };
    let fill_rect = if norm < 0.0 {
        Rect::from_min_max(Pos2::new(mid + norm * (rect.width() * 0.5), rect.top()), Pos2::new(mid, rect.bottom()))
    } else {
        Rect::from_min_max(Pos2::new(mid, rect.top()), Pos2::new(mid + norm * (rect.width() * 0.5), rect.bottom()))
    };
    painter.rect_filled(fill_rect, 3.0, fill_col);
    painter.line_segment([Pos2::new(mid, rect.top()), Pos2::new(mid, rect.bottom())], Stroke::new(1.5, TEXT_PRIMARY));

    ui.add_space(4.0);
    let active = state.active_driver();
    ui.horizontal(|ui| {
        ui.label(
            RichText::new(format!("{delta:+.3}s"))
                .size(16.0)
                .strong()
                .monospace()
                .color(fill_col),
        );
        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
            let best = format_lap_ms(active.and_then(|d| d.best_lap_ms));
            let last = format_lap_ms(active.and_then(|d| d.last_lap_ms));
            ui.label(RichText::new(format!("BEST {best}  LAST {last}")).size(10.5).monospace().color(TEXT_MUTED));
        });
    });
}

pub fn render_gforce(ui: &mut Ui, state: &TelemetryState, edit_mode: bool) {
    let inp = state.active_inputs();
    draw_header(
        ui,
        "G-Force",
        &format!("{:.2}G / {:.2}G", inp.lateral_g, inp.longitudinal_g),
        edit_mode,
    );

    let avail = ui.available_size();
    let side = avail.x.min(avail.y).max(90.0);
    let (rect, _) = ui.allocate_exact_size(Vec2::new(avail.x.max(90.0), side), Sense::hover());
    let painter = ui.painter_at(rect);
    let center = rect.center();
    let r = side * 0.44;

    painter.circle_filled(center, r, BG_ROW);
    painter.circle_stroke(center, r, Stroke::new(1.0, Color32::from_rgba_premultiplied(255, 255, 255, 28)));
    painter.circle_stroke(center, r * 0.5, Stroke::new(0.8, Color32::from_rgba_premultiplied(255, 255, 255, 18)));

    let max_g = 3.0_f32;
    let pts: Vec<Pos2> = state
        .input_history
        .iter()
        .rev()
        .take(60)
        .map(|s| {
            Pos2::new(
                center.x + (s.lateral_g / max_g).clamp(-1.0, 1.0) * r,
                center.y - (s.longitudinal_g / max_g).clamp(-1.0, 1.0) * r,
            )
        })
        .collect();
    if pts.len() > 1 {
        painter.add(egui::Shape::line(pts, Stroke::new(1.5, ACCENT_AMBER)));
    }

    let cur = Pos2::new(
        center.x + (inp.lateral_g / max_g).clamp(-1.0, 1.0) * r,
        center.y - (inp.longitudinal_g / max_g).clamp(-1.0, 1.0) * r,
    );
    painter.circle_filled(cur, 4.5, ACCENT_CYAN);
}

pub fn render_electronics(ui: &mut Ui, state: &TelemetryState, edit_mode: bool) {
    draw_header(ui, "Electronics", &state.session.flag_state, edit_mode);
    let inp = state.active_inputs();
    ui.horizontal(|ui| {
        let bb = inp
            .brake_bias_pct
            .map(|v| format!("BB {v:.1}%"))
            .unwrap_or_else(|| "BB --%".to_string());
        for (lbl, active, col) in [
            (bb.as_str(), true, ACCENT_CYAN),
            ("DRS", inp.drs_active, ACCENT_GREEN),
            ("PIT LIM", inp.pit_limiter, ACCENT_AMBER),
        ] {
            Frame::new()
                .fill(BG_ROW)
                .stroke(Stroke::new(1.0, if active { col } else { Color32::TRANSPARENT }))
                .corner_radius(CornerRadius::same(5))
                .inner_margin(Margin::symmetric(8, 4))
                .show(ui, |ui| {
                    ui.label(
                        RichText::new(lbl)
                            .size(11.0)
                            .strong()
                            .monospace()
                            .color(if active { col } else { TEXT_MUTED }),
                    );
                });
        }
    });
}
