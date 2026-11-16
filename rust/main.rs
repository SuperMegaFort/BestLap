mod layout;
mod proton;
mod providers;
mod types;
mod widgets;

use crate::layout::LayoutConfig;
use crate::providers::{lmu_rest::spawn_lmu_rest_poller, mock::spawn_mock_generator};
use crate::types::TelemetryState;
use crate::widgets::render_widget;
use crate::widgets::theme::{
    widget_frame, ACCENT_AMBER, ACCENT_CYAN, ACCENT_GREEN, ACCENT_RED, BG_PANEL, BG_ROW,
    BORDER_EDIT, TEXT_MUTED, TEXT_PRIMARY,
};
use eframe::egui::{self, Color32, RichText, ViewportBuilder, ViewportCommand, ViewportId};
use std::sync::{Arc, Mutex};
use std::time::Duration;

struct BestLapApp {
    state: Arc<Mutex<TelemetryState>>,
    is_mock_mode: Arc<Mutex<bool>>,
    layout: Arc<Mutex<LayoutConfig>>,
    edit_mode: Arc<Mutex<bool>>,
}

impl BestLapApp {
    fn new(start_mock: bool) -> Self {
        let state = Arc::new(Mutex::new(TelemetryState::default()));
        let is_mock_mode = Arc::new(Mutex::new(start_mock));
        let layout = Arc::new(Mutex::new(LayoutConfig::load_or_default()));
        let edit_mode = Arc::new(Mutex::new(false));

        spawn_lmu_rest_poller(
            "http://127.0.0.1:6397".to_string(),
            Arc::clone(&state),
            Arc::clone(&is_mock_mode),
        );
        spawn_mock_generator(Arc::clone(&state), Arc::clone(&is_mock_mode));

        Self {
            state,
            is_mock_mode,
            layout,
            edit_mode,
        }
    }
}

impl eframe::App for BestLapApp {
    fn clear_color(&self, _visuals: &egui::Visuals) -> [f32; 4] {
        [0.0, 0.0, 0.0, 0.0]
    }

    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        ctx.request_repaint_after(Duration::from_millis(16));

        // Keyboard shortcut Alt+Shift+L when Control Panel is focused
        if ctx.input(|i| i.modifiers.alt && i.modifiers.shift && i.key_pressed(egui::Key::L)) {
            if let Ok(mut em) = self.edit_mode.lock() {
                *em = !*em;
            }
        }

        let edit_mode_val = self.edit_mode.lock().map(|e| *e).unwrap_or(false);
        let mock_val = self.is_mock_mode.lock().map(|m| *m).unwrap_or(false);

        // Render Control Panel in root viewport
        egui::CentralPanel::default()
            .frame(widget_frame(edit_mode_val))
            .show(ctx, |ui| {
                ui.horizontal(|ui| {
                    ui.label(RichText::new("BESTLAP").size(13.0).strong().color(ACCENT_CYAN));
                    ui.label(RichText::new("RUST").size(10.0).strong().color(ACCENT_AMBER));
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        if ui.button("✕").clicked() {
                            ctx.send_viewport_cmd(ViewportCommand::Close);
                        }
                    });
                });

                if let Ok(st) = self.state.lock() {
                    let dot_col = if st.connected { ACCENT_GREEN } else { ACCENT_AMBER };
                    ui.horizontal(|ui| {
                        ui.label(RichText::new("●").size(10.0).color(dot_col));
                        ui.label(RichText::new(&st.status_message).size(10.5).color(TEXT_MUTED));
                    });
                }

                ui.add_space(6.0);
                ui.horizontal(|ui| {
                    let edit_lbl = if edit_mode_val { "🔓 Edit Mode: ON" } else { "🔒 Edit Mode: OFF" };
                    if ui
                        .add(
                            egui::Button::new(
                                RichText::new(edit_lbl)
                                    .size(11.0)
                                    .color(if edit_mode_val { Color32::BLACK } else { TEXT_PRIMARY }),
                            )
                            .fill(if edit_mode_val { BORDER_EDIT } else { BG_ROW }),
                        )
                        .clicked()
                    {
                        if let Ok(mut em) = self.edit_mode.lock() {
                            *em = !*em;
                        }
                    }

                    let mode_lbl = if mock_val { "Mock: ON" } else { "Live LMU" };
                    if ui.button(RichText::new(mode_lbl).size(11.0)).clicked() {
                        if let Ok(mut m) = self.is_mock_mode.lock() {
                            *m = !*m;
                        }
                    }

                    if ui.button(RichText::new("Reset").size(11.0)).clicked() {
                        if let Ok(mut lay) = self.layout.lock() {
                            *lay = LayoutConfig::default();
                            lay.save();
                        }
                    }
                });

                ui.add_space(6.0);
                ui.separator();
                ui.add_space(4.0);

                if let Ok(mut lay) = self.layout.lock() {
                    let mut changed = false;
                    egui::Grid::new("widget_toggles").num_columns(2).spacing([8.0, 4.0]).show(ui, |ui| {
                        for (idx, w) in lay.widgets.values_mut().enumerate() {
                            if ui.checkbox(&mut w.enabled, RichText::new(&w.title).size(11.0)).changed() {
                                changed = true;
                            }
                            if idx % 2 == 1 {
                                ui.end_row();
                            }
                        }
                    });
                    if changed {
                        lay.save();
                    }
                }
            });

        // Render each enabled widget as an independent floating transparent viewport
        let widgets_snapshot: Vec<_> = self
            .layout
            .lock()
            .map(|l| l.widgets.values().filter(|w| w.enabled).cloned().collect())
            .unwrap_or_default();

        for w in widgets_snapshot {
            let vp_id = ViewportId::from_hash_of(&w.id);
            let builder = ViewportBuilder::default()
                .with_title(&w.title)
                .with_inner_size([w.width, w.height])
                .with_min_inner_size([w.min_width, w.min_height])
                .with_position([w.x, w.y])
                .with_decorations(false)
                .with_transparent(true)
                .with_always_on_top()
                .with_taskbar(false)
                .with_mouse_passthrough(!edit_mode_val);

            let state_arc = Arc::clone(&self.state);
            let layout_arc = Arc::clone(&self.layout);
            let edit_arc = Arc::clone(&self.edit_mode);
            let widget_id = w.id.clone();

            ctx.show_viewport_deferred(vp_id, builder, move |ctx, _class| {
                let edit_now = edit_arc.lock().map(|e| *e).unwrap_or(false);
                ctx.send_viewport_cmd(ViewportCommand::MousePassthrough(!edit_now));

                // Save moved/resized geometry
                if let Some(outer_rect) = ctx.input(|i| i.viewport().outer_rect) {
                    if let Some(inner_rect) = ctx.input(|i| i.viewport().inner_rect) {
                        if let Ok(mut lay) = layout_arc.lock() {
                            if let Some(cfg) = lay.widgets.get_mut(&widget_id) {
                                let moved = (cfg.x - outer_rect.min.x).abs() > 2.0
                                    || (cfg.y - outer_rect.min.y).abs() > 2.0
                                    || (cfg.width - inner_rect.width()).abs() > 2.0
                                    || (cfg.height - inner_rect.height()).abs() > 2.0;
                                if moved {
                                    cfg.x = outer_rect.min.x;
                                    cfg.y = outer_rect.min.y;
                                    cfg.width = inner_rect.width();
                                    cfg.height = inner_rect.height();
                                    lay.save();
                                }
                            }
                        }
                    }
                }

                egui::CentralPanel::default()
                    .frame(widget_frame(edit_now))
                    .show(ctx, |ui| {
                        if edit_now {
                            let drag_resp = ui.interact(
                                ui.max_rect(),
                                egui::Id::new(("drag", &widget_id)),
                                egui::Sense::drag(),
                            );
                            if drag_resp.drag_started() {
                                ctx.send_viewport_cmd(ViewportCommand::StartDrag);
                            }
                        }

                        if let Ok(mut st) = state_arc.lock() {
                            render_widget(&widget_id, ui, &mut st, edit_now);
                        }
                    });
            });
        }
    }
}

fn main() -> eframe::Result<()> {
    let start_mock = std::env::args().any(|a| a == "--mock");
    let options = eframe::NativeOptions {
        viewport: ViewportBuilder::default()
            .with_title("BestLap Control")
            .with_inner_size([320.0, 250.0])
            .with_position([520.0, 24.0])
            .with_decorations(true)
            .with_transparent(true)
            .with_always_on_top(),
        ..Default::default()
    };

    eframe::run_native(
        "BestLap",
        options,
        Box::new(move |cc| {
            let mut visuals = egui::Visuals::dark();
            visuals.panel_fill = BG_PANEL;
            visuals.window_fill = BG_PANEL;
            visuals.override_text_color = Some(TEXT_PRIMARY);
            cc.egui_ctx.set_visuals(visuals);
            Ok(Box::new(BestLapApp::new(start_mock)))
        }),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::providers::lmu_udp::parse_udp_packet;
    use crate::types::{TireCompound, VehicleClass};

    #[test]
    fn normalizes_lmu_classes_and_tires() {
        assert_eq!(VehicleClass::from_lmu_str("Hypercar"), VehicleClass::Hypercar);
        assert_eq!(VehicleClass::from_lmu_str("LMGT3"), VehicleClass::Lmgt3);
        assert_eq!(TireCompound::from_lmu_str("Soft"), TireCompound::Soft);
        assert_eq!(TireCompound::from_lmu_str("Wet").short_code(), "W");
    }

    #[test]
    fn parses_udp_bridge_packet() {
        let json = br#"{"throttle":0.85,"brake":0.1,"clutch":0.0,"steering":-0.2,"gear":4,"speedKmh":210,"rpm":7200,"maxRpm":8500,"fuelLiters":44.5,"fuelCapacity":100,"tires":[{"wearPct":98.5,"tempSurfaceC":85,"tempCoreC":82}]}"#;
        let parsed = parse_udp_packet(json).expect("should parse");
        assert_eq!(parsed.inputs.gear, 4);
        assert_eq!(parsed.inputs.speed_kmh, 210);
        assert!((parsed.inputs.throttle - 0.85).abs() < 0.001);
        assert_eq!(parsed.tires.fl.temp_surface_c, Some(85));
    }

    #[test]
    fn layout_has_tinypedal_and_bestlap_widgets() {
        let cfg = LayoutConfig::default();
        assert!(cfg.widgets.contains_key("leaderboard"));
        assert!(cfg.widgets.contains_key("radar"));
        assert!(cfg.widgets.contains_key("delta"));
        assert!(cfg.widgets.contains_key("gforce"));
        assert!(cfg.widgets.contains_key("electronics"));
    }
}
