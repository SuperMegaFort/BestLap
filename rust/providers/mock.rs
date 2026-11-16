use crate::types::{
    FuelState, InputSample, PitStatus, PlayerInputs, SessionInfo, StandingsEntry, TelemetryState,
    TireCompound, TireCorner, TiresState, TrackCondition, TrackPoint, VehicleClass,
    VehicleTelemetry, WeatherState,
};
use std::collections::HashMap;
use std::f32::consts::PI;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

pub fn spawn_mock_generator(state: Arc<Mutex<TelemetryState>>, is_mock_mode: Arc<Mutex<bool>>) {
    thread::spawn(move || {
        let start = Instant::now();
        let mut pts = Vec::with_capacity(180);
        for i in 0..180 {
            let a = (i as f32 / 180.0) * 2.0 * PI;
            let r = 180.0 + 55.0 * (2.0 * a).sin() + 25.0 * (3.0 * a).cos();
            pts.push(TrackPoint {
                x: r * a.cos(),
                z: r * a.sin() * 0.72,
            });
        }

        loop {
            if !is_mock_mode.lock().map(|m| *m).unwrap_or(false) {
                thread::sleep(Duration::from_millis(150));
                continue;
            }

            let t = start.elapsed().as_secs_f32();
            let throttle = ((t * 1.3).sin() * 0.5 + 0.5).powf(0.8);
            let brake = if throttle < 0.25 { (0.25 - throttle) * 4.0 } else { 0.0 };
            let clutch = if (t % 7.0) < 0.35 { 0.8 } else { 0.0 };
            let steering = (t * 0.9).sin() * 0.45;
            let lat_g = (t * 0.9).sin() * 1.85;
            let long_g = throttle * 0.9 - brake * 2.1;

            let inputs = PlayerInputs {
                throttle,
                brake,
                clutch,
                steering,
                gear: 4 + ((t * 0.5).sin() * 2.0).round() as i32,
                speed_kmh: (165.0 + throttle * 145.0 - brake * 90.0).round() as i32,
                rpm: (5400.0 + throttle * 2900.0).round() as i32,
                max_rpm: 8500,
                lateral_g: lat_g,
                longitudinal_g: long_g,
                brake_bias_pct: Some(54.2),
                pit_limiter: false,
                drs_active: throttle > 0.92,
            };

            let drivers = [
                ("car-1", "K. Estre", "6", VehicleClass::Hypercar, 1, 1, 1, 203_111, TireCompound::Medium, 78.0, false, 0.0),
                ("car-2", "A. Pier Guidi", "51", VehicleClass::Hypercar, 2, 2, -1, 203_450, TireCompound::Medium, 74.0, false, 0.015),
                ("car-3", "Vous (Player)", "50", VehicleClass::Hypercar, 3, 3, 2, 203_820, TireCompound::Soft, 69.0, true, 0.028),
                ("car-4", "R. Kubica", "83", VehicleClass::Hypercar, 4, 4, 0, 204_190, TireCompound::Medium, 81.0, false, 0.041),
                ("car-5", "T. Blomqvist", "22", VehicleClass::Lmp2, 5, 1, 1, 211_400, TireCompound::Medium, 88.0, false, 0.32),
                ("car-6", "V. Rossi", "46", VehicleClass::Lmgt3, 6, 1, 3, 232_110, TireCompound::Hard, 92.0, false, 0.64),
                ("car-7", "M. Cairoli", "63", VehicleClass::Lmgt3, 7, 2, -2, 232_680, TireCompound::Soft, 84.0, false, 0.652),
            ];

            let mut standings = Vec::new();
            let mut car_inp = HashMap::new();
            let mut car_tel = HashMap::new();

            for (i, (id, name, num, cls, pos, cpos, gain, best, comp, ve, is_p, base_pct)) in drivers.iter().enumerate() {
                let pct = ((*base_pct + (t * 0.012) as f64) % 1.0 + 1.0) % 1.0;
                let a = (pct as f32) * 2.0 * PI;
                let r = 180.0 + 55.0 * (2.0 * a).sin() + 25.0 * (3.0 * a).cos();
                let wx = (r * a.cos()) as f64;
                let wz = (r * a.sin() * 0.72) as f64;

                standings.push(StandingsEntry {
                    id: id.to_string(),
                    driver_name: name.to_string(),
                    car_name: "LMU Mock".to_string(),
                    car_number: num.to_string(),
                    car_class: *cls,
                    position: *pos,
                    class_position: *cpos,
                    position_gain: *gain,
                    lap: 14,
                    last_lap_ms: Some(*best + ((i as i64) * 120)),
                    best_lap_ms: Some(*best),
                    sector1_ms: Some(48_210),
                    sector2_ms: Some(71_450),
                    gap_to_leader_sec: if *pos == 1 { None } else { Some((*pos as f64 - 1.0) * 1.45) },
                    interval_sec: if *pos == 1 { None } else { Some(1.45) },
                    laps_behind_leader: 0,
                    pit_status: PitStatus::OnTrack,
                    is_player: *is_p,
                    lap_distance_pct: pct,
                    world_x: wx,
                    world_z: wz,
                    tire_compound: *comp,
                    energy_pct: Some(*ve),
                    is_class_best: *cpos == 1,
                    is_personal_best: *is_p,
                });
                car_inp.insert(id.to_string(), inputs.clone());
                car_tel.insert(
                    id.to_string(),
                    VehicleTelemetry {
                        tires: TiresState {
                            fl: TireCorner { wear_pct: Some(92.4), temp_surface_c: Some(86), temp_core_c: Some(84), brake_temp_c: Some(410), pressure_kpa: Some(141.2), compound: Some(*comp) },
                            fr: TireCorner { wear_pct: Some(90.8), temp_surface_c: Some(89), temp_core_c: Some(86), brake_temp_c: Some(425), pressure_kpa: Some(142.0), compound: Some(*comp) },
                            rl: TireCorner { wear_pct: Some(94.1), temp_surface_c: Some(82), temp_core_c: Some(80), brake_temp_c: Some(360), pressure_kpa: Some(140.5), compound: Some(*comp) },
                            rr: TireCorner { wear_pct: Some(93.6), temp_surface_c: Some(84), temp_core_c: Some(82), brake_temp_c: Some(370), pressure_kpa: Some(141.0), compound: Some(*comp) },
                        },
                        fuel: FuelState {
                            level_liters: 47.7,
                            capacity_liters: 100.0,
                            per_lap_liters: 3.64,
                            laps_remaining: Some(13.1),
                            target_delta_liters: Some(1.67),
                            virtual_energy_pct: Some(*ve as f32),
                        },
                        weather: WeatherState {
                            track_temp_c: 34,
                            air_temp_c: 22,
                            humidity_pct: 48,
                            condition: TrackCondition::Dry,
                            grip_pct: 99,
                        },
                    },
                );
            }

            if let Ok(mut st) = state.lock() {
                st.connected = true;
                st.provider_name = "mock".to_string();
                st.status_message = "Mock Telemetry Active".to_string();
                st.session = SessionInfo {
                    track_name: "Circuit de la Sarthe (Mock)".to_string(),
                    session_type: "RACE".to_string(),
                    time_remaining_sec: Some((2700.0 - t as f64).max(0.0)),
                    total_time_sec: Some(2700.0),
                    current_lap: 14,
                    total_laps: Some(25),
                    track_temp_c: Some(34),
                    ambient_temp_c: Some(22),
                    flag_state: "GREEN".to_string(),
                };
                st.standings = standings;
                st.player_inputs = inputs.clone();
                st.vehicle_telemetry = car_tel.get("car-3").cloned().unwrap_or_default();
                st.car_inputs_by_id = car_inp;
                st.car_telemetry_by_id = car_tel;
                st.track_map_points = pts.clone();
                st.live_delta_sec = (t * 0.4).sin() * 0.65;

                if st.input_history.len() >= 240 {
                    st.input_history.pop_front();
                }
                st.input_history.push_back(InputSample {
                    throttle,
                    brake,
                    clutch,
                    lateral_g: lat_g,
                    longitudinal_g: long_g,
                });
            }

            thread::sleep(Duration::from_millis(16));
        }
    });
}
