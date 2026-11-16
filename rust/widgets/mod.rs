pub mod standings;
pub mod telemetry;
pub mod theme;
pub mod tinypedal;

use crate::types::TelemetryState;
use egui::Ui;

pub fn render_widget(id: &str, ui: &mut Ui, state: &mut TelemetryState, edit_mode: bool) {
    match id {
        "leaderboard" => standings::render_leaderboard(ui, state, edit_mode),
        "relative" => standings::render_relative(ui, state, edit_mode),
        "inputs" => telemetry::render_inputs(ui, state, edit_mode),
        "input-graph" => telemetry::render_input_graph(ui, state, edit_mode),
        "strategy" => telemetry::render_strategy(ui, state, edit_mode),
        "trackmap" => telemetry::render_trackmap(ui, state, edit_mode),
        "radar" => tinypedal::render_radar(ui, state, edit_mode),
        "delta" => tinypedal::render_delta(ui, state, edit_mode),
        "gforce" => tinypedal::render_gforce(ui, state, edit_mode),
        "electronics" => tinypedal::render_electronics(ui, state, edit_mode),
        _ => {}
    }
}
