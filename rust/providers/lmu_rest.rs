use crate::proton::ProtonBridgeGuard;
use crate::providers::lmu_udp::UdpReceiver;
use crate::types::{
    FuelState, InputSample, PitStatus, PlayerInputs, SessionInfo, StandingsEntry, TelemetryState,
    TireCompound, TireCorner, TiresState, TrackCondition, TrackPoint, VehicleClass,
    VehicleTelemetry, WeatherState,
};
use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawCarPosition {
    x: Option<f64>,
    z: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawStanding {
    #[serde(rename = "slotID")]
    slot_id: Option<i64>,
    driver_name: Option<String>,
    vehicle_name: Option<String>,
    car_number: Option<serde_json::Value>,
    car_class: Option<String>,
    position: Option<i32>,
    laps_completed: Option<i32>,
    last_lap_time: Option<f64>,
    best_lap_time: Option<f64>,
    current_sector_time1: Option<f64>,
    current_sector_time2: Option<f64>,
    time_behind_leader: Option<f64>,
    time_behind_next: Option<f64>,
    laps_behind_leader: Option<i32>,
    player: Option<bool>,
    pitting: Option<bool>,
    in_garage_stall: Option<bool>,
    lap_distance: Option<f64>,
    car_position: Option<RawCarPosition>,
    tire_compound: Option<String>,
    fuel_fraction: Option<f64>,
    ve_fraction: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawSessionInfo {
    track_name: Option<String>,
    session: Option<String>,
    lap_distance: Option<f64>,
    current_event_time: Option<f64>,
    end_event_time: Option<f64>,
    maximum_laps: Option<i32>,
    track_temp: Option<f64>,
    ambient_temp: Option<f64>,
    raining: Option<f64>,
    max_path_wetness: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct RawTrackPoint {
    #[serde(rename = "type")]
    pt_type: Option<i32>,
    x: Option<f32>,
    z: Option<f32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawRepairWeather {
    ambient_temp_kelvin: Option<f64>,
    track_temp_kelvin: Option<f64>,
    humidity: Option<f64>,
    raining: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawRepairFuel {
    current_fuel: Option<f64>,
    max_fuel: Option<f64>,
    current_virtual_energy: Option<f64>,
    max_virtual_energy: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct RawRepairWearables {
    tires: Option<Vec<f64>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawRepairAndRefuel {
    current_weather: Option<RawRepairWeather>,
    fuel_info: Option<RawRepairFuel>,
    wearables: Option<RawRepairWearables>,
}

fn sec_to_ms(sec: Option<f64>) -> Option<i64> {
    let s = sec?;
    if !s.is_finite() || s <= 0.0 || s > 36000.0 {
        return None;
    }
    Some((s * 1000.0).round() as i64)
}

fn map_session_type(raw: Option<&str>) -> String {
    let u = raw.unwrap_or("").trim().to_uppercase();
    if u.contains("RACE") {
        "RACE".to_string()
    } else if u.contains("QUAL") {
        "QUALIFYING".to_string()
    } else if u.contains("WARM") {
        "WARMUP".to_string()
    } else if u.contains("PRACTICE") || u.contains("TEST") {
        "PRACTICE".to_string()
    } else {
        "UNKNOWN".to_string()
    }
}

pub fn spawn_lmu_rest_poller(
    base_url: String,
    state: Arc<Mutex<TelemetryState>>,
    is_mock_mode: Arc<Mutex<bool>>,
) {
    let udp = UdpReceiver::start("127.0.0.1:20778");

    thread::spawn(move || {
        let agent = ureq::AgentBuilder::new()
            .timeout(Duration::from_millis(900))
            .build();
        let base = base_url.trim_end_matches('/').to_string();
        let mut bridge = ProtonBridgeGuard::default();

        let mut cached_track = String::new();
        let mut cached_points: Vec<TrackPoint> = Vec::new();
        let mut cached_repair: Option<RawRepairAndRefuel> = None;
        let mut last_rest_poll = Instant::now() - Duration::from_secs(10);
        let mut last_repair_poll = Instant::now() - Duration::from_secs(10);

        let mut last_standings: Vec<RawStanding> = Vec::new();
        let mut last_session: Option<RawSessionInfo> = None;
        let mut connected = false;

        loop {
            if is_mock_mode.lock().map(|m| *m).unwrap_or(false) {
                thread::sleep(Duration::from_millis(100));
                continue;
            }

            if last_rest_poll.elapsed() >= Duration::from_millis(120) {
                last_rest_poll = Instant::now();
                let standings_res = agent
                    .get(&format!("{base}/rest/watch/standings"))
                    .call()
                    .ok()
                    .and_then(|r| r.into_json::<Vec<RawStanding>>().ok());

                match standings_res {
                    Some(standings) => {
                        if !connected {
                            connected = true;
                            bridge.ensure_running();
                        }
                        last_standings = standings;
                        last_session = agent
                            .get(&format!("{base}/rest/watch/sessionInfo"))
                            .call()
                            .ok()
                            .and_then(|r| r.into_json::<RawSessionInfo>().ok());

                        let track_name = last_session
                            .as_ref()
                            .and_then(|s| s.track_name.as_deref())
                            .unwrap_or("")
                            .trim()
                            .to_string();
                        if !track_name.is_empty() && track_name != cached_track {
                            cached_track = track_name;
                            if let Ok(resp) = agent.get(&format!("{base}/rest/watch/trackMap")).call() {
                                if let Ok(raw_pts) = resp.into_json::<Vec<RawTrackPoint>>() {
                                    let main_pts: Vec<TrackPoint> = raw_pts
                                        .into_iter()
                                        .filter(|p| p.pt_type == Some(0))
                                        .filter_map(|p| Some(TrackPoint { x: p.x?, z: p.z? }))
                                        .collect();
                                    let step = (main_pts.len() / 200).max(1);
                                    cached_points = main_pts.into_iter().step_by(step).collect();
                                }
                            }
                        }

                        if last_repair_poll.elapsed() >= Duration::from_millis(500) {
                            last_repair_poll = Instant::now();
                            if let Ok(resp) = agent
                                .get(&format!("{base}/rest/garage/UIScreen/RepairAndRefuel"))
                                .call()
                            {
                                if let Ok(rr) = resp.into_json::<RawRepairAndRefuel>() {
                                    cached_repair = Some(rr);
                                }
                            }
                        }
                    }
                    None => {
                        if connected {
                            connected = false;
                            bridge.stop();
                        }
                        if let Ok(mut st) = state.lock() {
                            st.connected = false;
                            st.status_message = "Waiting for Le Mans Ultimate...".to_string();
                            st.session.track_name = "Waiting for Le Mans Ultimate...".to_string();
                        }
                        thread::sleep(Duration::from_millis(400));
                        continue;
                    }
                }
            }

            // Build frame & merge 60Hz UDP
            let track_len = last_session
                .as_ref()
                .and_then(|s| s.lap_distance)
                .filter(|&d| d > 100.0)
                .unwrap_or(5000.0);

            let rr_weather = cached_repair.as_ref().and_then(|r| r.current_weather.as_ref());
            let track_temp_c = last_session
                .as_ref()
                .and_then(|s| s.track_temp)
                .map(|t| t.round() as i32)
                .or_else(|| rr_weather.and_then(|w| w.track_temp_kelvin).map(|k| (k - 273.15).round() as i32))
                .unwrap_or(25);
            let air_temp_c = last_session
                .as_ref()
                .and_then(|s| s.ambient_temp)
                .map(|t| t.round() as i32)
                .or_else(|| rr_weather.and_then(|w| w.ambient_temp_kelvin).map(|k| (k - 273.15).round() as i32))
                .unwrap_or(20);
            let wetness = last_session
                .as_ref()
                .and_then(|s| s.max_path_wetness.or(s.raining))
                .or_else(|| rr_weather.and_then(|w| w.raining))
                .unwrap_or(0.0);
            let condition = if wetness > 0.6 {
                TrackCondition::Rain
            } else if wetness > 0.25 {
                TrackCondition::Wet
            } else if wetness > 0.05 {
                TrackCondition::Damp
            } else {
                TrackCondition::Dry
            };
            let humidity_pct = rr_weather
                .and_then(|w| w.humidity)
                .map(|h| (h * 100.0).round() as i32)
                .unwrap_or_else(|| (45.0 + wetness * 50.0).round() as i32);

            let weather = WeatherState {
                track_temp_c,
                air_temp_c,
                humidity_pct,
                condition,
                grip_pct: (100.0 - wetness * 28.0).round() as i32,
            };

            let mut entries: Vec<StandingsEntry> = Vec::with_capacity(last_standings.len());
            let mut seen_ids = HashSet::new();
            let mut car_tel_by_id: HashMap<String, VehicleTelemetry> = HashMap::new();
            let mut car_inp_by_id: HashMap<String, PlayerInputs> = HashMap::new();

            for (idx, raw) in last_standings.iter().enumerate() {
                let id = raw
                    .slot_id
                    .map(|s| format!("car-{s}"))
                    .filter(|id| !seen_ids.contains(id))
                    .unwrap_or_else(|| format!("car-{idx}"));
                seen_ids.insert(id.clone());

                let car_number = match &raw.car_number {
                    Some(serde_json::Value::String(s)) => s.clone(),
                    Some(serde_json::Value::Number(n)) => n.to_string(),
                    _ => format!("{}", idx + 1),
                };
                let car_class = VehicleClass::from_lmu_str(raw.car_class.as_deref().unwrap_or(""));
                let pit_status = if raw.in_garage_stall == Some(true) {
                    PitStatus::Garage
                } else if raw.pitting == Some(true) {
                    PitStatus::PitLane
                } else {
                    PitStatus::OnTrack
                };
                let lap_distance_pct = raw
                    .lap_distance
                    .map(|d| ((d % track_len) / track_len).clamp(0.0, 1.0))
                    .unwrap_or(0.0);
                let compound = TireCompound::from_lmu_str(raw.tire_compound.as_deref().unwrap_or(""));

                let mut tel = VehicleTelemetry {
                    tires: TiresState {
                        fl: TireCorner { compound: Some(compound), ..Default::default() },
                        fr: TireCorner { compound: Some(compound), ..Default::default() },
                        rl: TireCorner { compound: Some(compound), ..Default::default() },
                        rr: TireCorner { compound: Some(compound), ..Default::default() },
                    },
                    fuel: FuelState {
                        level_liters: (raw.fuel_fraction.unwrap_or(0.0) * 100.0) as f32,
                        capacity_liters: 100.0,
                        virtual_energy_pct: raw.ve_fraction.map(|v| (v * 100.0) as f32),
                        ..Default::default()
                    },
                    weather: weather.clone(),
                };

                let is_player = raw.player == Some(true);
                if is_player {
                    if let Some(ref rr) = cached_repair {
                        if let Some(ref tires) = rr.wearables.as_ref().and_then(|w| w.tires.as_ref()) {
                            if tires.len() >= 4 {
                                tel.tires.fl.wear_pct = Some((tires[0].clamp(0.0, 1.0) * 100.0) as f32);
                                tel.tires.fr.wear_pct = Some((tires[1].clamp(0.0, 1.0) * 100.0) as f32);
                                tel.tires.rl.wear_pct = Some((tires[2].clamp(0.0, 1.0) * 100.0) as f32);
                                tel.tires.rr.wear_pct = Some((tires[3].clamp(0.0, 1.0) * 100.0) as f32);
                            }
                        }
                        if let Some(ref fi) = rr.fuel_info {
                            if let Some(max_f) = fi.max_fuel.filter(|&m| m > 0.0) {
                                tel.fuel.capacity_liters = max_f as f32;
                                if let Some(cur_f) = fi.current_fuel {
                                    let liters = if cur_f <= 1.0001 { cur_f * max_f } else { cur_f };
                                    tel.fuel.level_liters = liters as f32;
                                }
                            }
                            if let (Some(cur_ve), Some(max_ve)) = (fi.current_virtual_energy, fi.max_virtual_energy) {
                                if max_ve > 0.0 {
                                    tel.fuel.virtual_energy_pct = Some(((cur_ve / max_ve) * 100.0) as f32);
                                }
                            }
                        }
                    }
                }

                car_tel_by_id.insert(id.clone(), tel);
                car_inp_by_id.insert(id.clone(), PlayerInputs::default());

                entries.push(StandingsEntry {
                    id,
                    driver_name: raw
                        .driver_name
                        .clone()
                        .filter(|s| !s.trim().is_empty())
                        .unwrap_or_else(|| format!("Driver #{car_number}")),
                    car_name: raw.vehicle_name.clone().unwrap_or_default(),
                    car_number,
                    car_class,
                    position: raw.position.unwrap_or((idx + 1) as i32),
                    class_position: 0,
                    position_gain: 0,
                    lap: raw.laps_completed.unwrap_or(0),
                    last_lap_ms: sec_to_ms(raw.last_lap_time),
                    best_lap_ms: sec_to_ms(raw.best_lap_time),
                    sector1_ms: sec_to_ms(raw.current_sector_time1),
                    sector2_ms: sec_to_ms(raw.current_sector_time2),
                    gap_to_leader_sec: raw.time_behind_leader.filter(|&g| g >= 0.0),
                    interval_sec: raw.time_behind_next.filter(|&g| g >= 0.0),
                    laps_behind_leader: raw.laps_behind_leader.unwrap_or(0),
                    pit_status,
                    is_player,
                    lap_distance_pct,
                    world_x: raw.car_position.as_ref().and_then(|p| p.x).unwrap_or(0.0),
                    world_z: raw.car_position.as_ref().and_then(|p| p.z).unwrap_or(0.0),
                    tire_compound: compound,
                    energy_pct: raw.ve_fraction.map(|v| (v * 100.0).clamp(0.0, 100.0)),
                    is_class_best: false,
                    is_personal_best: false,
                });
            }

            // Sort & compute class positions + class bests
            entries.sort_by_key(|e| e.position);
            let mut class_counts: HashMap<VehicleClass, i32> = HashMap::new();
            let mut class_best: HashMap<VehicleClass, i64> = HashMap::new();
            for e in &entries {
                if let Some(b) = e.best_lap_ms {
                    let cur = class_best.entry(e.car_class).or_insert(b);
                    if b < *cur {
                        *cur = b;
                    }
                }
            }
            for e in &mut entries {
                let c = class_counts.entry(e.car_class).or_insert(0);
                *c += 1;
                e.class_position = *c;
                if let (Some(last), Some(&best)) = (e.last_lap_ms, class_best.get(&e.car_class)) {
                    if last <= best {
                        e.is_class_best = true;
                    }
                }
                if let (Some(last), Some(pb)) = (e.last_lap_ms, e.best_lap_ms) {
                    if last <= pb {
                        e.is_personal_best = true;
                    }
                }
            }

            let mut player_inputs = PlayerInputs::default();
            let player_id = entries.iter().find(|e| e.is_player).map(|e| e.id.clone());
            let mut player_tel = player_id
                .as_ref()
                .and_then(|id| car_tel_by_id.get(id))
                .cloned()
                .unwrap_or_default();

            if let Some(udp_sample) = udp.latest_if_fresh() {
                player_inputs = udp_sample.inputs.clone();
                if udp_sample.fuel_liters > 0.0 {
                    player_tel.fuel.level_liters = udp_sample.fuel_liters;
                }
                if udp_sample.fuel_capacity > 1.0 {
                    player_tel.fuel.capacity_liters = udp_sample.fuel_capacity;
                }
                if udp_sample.tires.fl.temp_surface_c.is_some() {
                    player_tel.tires.fl.temp_surface_c = udp_sample.tires.fl.temp_surface_c;
                    player_tel.tires.fr.temp_surface_c = udp_sample.tires.fr.temp_surface_c;
                    player_tel.tires.rl.temp_surface_c = udp_sample.tires.rl.temp_surface_c;
                    player_tel.tires.rr.temp_surface_c = udp_sample.tires.rr.temp_surface_c;
                    player_tel.tires.fl.temp_core_c = udp_sample.tires.fl.temp_core_c;
                    player_tel.tires.fr.temp_core_c = udp_sample.tires.fr.temp_core_c;
                    player_tel.tires.rl.temp_core_c = udp_sample.tires.rl.temp_core_c;
                    player_tel.tires.rr.temp_core_c = udp_sample.tires.rr.temp_core_c;
                }
                if let Some(ref pid) = player_id {
                    car_inp_by_id.insert(pid.clone(), player_inputs.clone());
                    car_tel_by_id.insert(pid.clone(), player_tel.clone());
                }
            }

            let time_remaining = last_session
                .as_ref()
                .and_then(|s| Some((s.end_event_time? - s.current_event_time?).max(0.0)));
            let player_lap = entries.iter().find(|e| e.is_player).map(|e| e.lap).unwrap_or(0);

            if let Ok(mut st) = state.lock() {
                st.connected = true;
                st.provider_name = "lmu-rest + 60Hz SHM".to_string();
                st.status_message = "Connected to Le Mans Ultimate".to_string();
                st.session = SessionInfo {
                    track_name: cached_track.clone(),
                    session_type: map_session_type(last_session.as_ref().and_then(|s| s.session.as_deref())),
                    time_remaining_sec: time_remaining,
                    total_time_sec: last_session.as_ref().and_then(|s| s.end_event_time),
                    current_lap: player_lap,
                    total_laps: last_session
                        .as_ref()
                        .and_then(|s| s.maximum_laps)
                        .filter(|&l| l > 0 && l < 10000),
                    track_temp_c: Some(track_temp_c),
                    ambient_temp_c: Some(air_temp_c),
                    flag_state: "GREEN".to_string(),
                };
                st.standings = entries;
                st.player_inputs = player_inputs.clone();
                st.vehicle_telemetry = player_tel;
                st.car_inputs_by_id = car_inp_by_id;
                st.car_telemetry_by_id = car_tel_by_id;
                st.track_map_points = cached_points.clone();

                if st.input_history.len() >= 240 {
                    st.input_history.pop_front();
                }
                st.input_history.push_back(InputSample {
                    throttle: player_inputs.throttle,
                    brake: player_inputs.brake,
                    clutch: player_inputs.clutch,
                    lateral_g: player_inputs.lateral_g,
                    longitudinal_g: player_inputs.longitudinal_g,
                });
            }

            thread::sleep(Duration::from_millis(16));
        }
    });
}
