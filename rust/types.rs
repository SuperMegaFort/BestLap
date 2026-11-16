use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum VehicleClass {
    #[serde(rename = "HYPERCAR")]
    Hypercar,
    #[serde(rename = "LMP2")]
    Lmp2,
    #[serde(rename = "LMP3")]
    Lmp3,
    #[serde(rename = "LMGT3")]
    Lmgt3,
    #[serde(rename = "GTE")]
    Gte,
    #[serde(rename = "UNKNOWN")]
    Unknown,
}

impl VehicleClass {
    pub fn label(self) -> &'static str {
        match self {
            Self::Hypercar => "HYPER",
            Self::Lmp2 => "LMP2",
            Self::Lmp3 => "LMP3",
            Self::Lmgt3 => "GT3",
            Self::Gte => "GTE",
            Self::Unknown => "UNK",
        }
    }

    pub fn from_lmu_str(raw: &str) -> Self {
        let u = raw.trim().to_uppercase();
        if u.contains("HYPER") || u.contains("LMH") || u.contains("LMDH") || u.contains("LMP1") {
            Self::Hypercar
        } else if u.contains("LMP2") {
            Self::Lmp2
        } else if u.contains("LMP3") {
            Self::Lmp3
        } else if u.contains("GT3") {
            Self::Lmgt3
        } else if u.contains("GTE") {
            Self::Gte
        } else {
            Self::Unknown
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TireCompound {
    #[serde(rename = "SOFT")]
    Soft,
    #[serde(rename = "MEDIUM")]
    Medium,
    #[serde(rename = "HARD")]
    Hard,
    #[serde(rename = "WET")]
    Wet,
    #[serde(rename = "UNKNOWN")]
    Unknown,
}

impl TireCompound {
    pub fn short_code(self) -> &'static str {
        match self {
            Self::Soft => "S",
            Self::Medium => "M",
            Self::Hard => "H",
            Self::Wet => "W",
            Self::Unknown => "-",
        }
    }

    pub fn from_lmu_str(raw: &str) -> Self {
        let u = raw.trim().to_uppercase();
        if u.contains("WET") || u.contains("RAIN") || u.contains("INTER") {
            Self::Wet
        } else if u.contains("SOFT") {
            Self::Soft
        } else if u.contains("MED") {
            Self::Medium
        } else if u.contains("HARD") {
            Self::Hard
        } else {
            Self::Unknown
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PitStatus {
    #[serde(rename = "ON_TRACK")]
    OnTrack,
    #[serde(rename = "PIT_LANE")]
    PitLane,
    #[serde(rename = "GARAGE")]
    Garage,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TrackCondition {
    #[serde(rename = "DRY")]
    Dry,
    #[serde(rename = "DAMP")]
    Damp,
    #[serde(rename = "WET")]
    Wet,
    #[serde(rename = "RAIN")]
    Rain,
}

impl TrackCondition {
    pub fn label(self) -> &'static str {
        match self {
            Self::Dry => "DRY",
            Self::Damp => "DAMP",
            Self::Wet => "WET",
            Self::Rain => "RAIN",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionInfo {
    pub track_name: String,
    pub session_type: String,
    pub time_remaining_sec: Option<f64>,
    pub total_time_sec: Option<f64>,
    pub current_lap: i32,
    pub total_laps: Option<i32>,
    pub track_temp_c: Option<i32>,
    pub ambient_temp_c: Option<i32>,
    pub flag_state: String,
}

impl Default for SessionInfo {
    fn default() -> Self {
        Self {
            track_name: "Waiting for Le Mans Ultimate...".to_string(),
            session_type: "UNKNOWN".to_string(),
            time_remaining_sec: None,
            total_time_sec: None,
            current_lap: 0,
            total_laps: None,
            track_temp_c: None,
            ambient_temp_c: None,
            flag_state: "GREEN".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StandingsEntry {
    pub id: String,
    pub driver_name: String,
    pub car_name: String,
    pub car_number: String,
    pub car_class: VehicleClass,
    pub position: i32,
    pub class_position: i32,
    pub position_gain: i32,
    pub lap: i32,
    pub last_lap_ms: Option<i64>,
    pub best_lap_ms: Option<i64>,
    pub sector1_ms: Option<i64>,
    pub sector2_ms: Option<i64>,
    pub gap_to_leader_sec: Option<f64>,
    pub interval_sec: Option<f64>,
    pub laps_behind_leader: i32,
    pub pit_status: PitStatus,
    pub is_player: bool,
    pub lap_distance_pct: f64,
    pub world_x: f64,
    pub world_z: f64,
    pub tire_compound: TireCompound,
    pub energy_pct: Option<f64>,
    pub is_class_best: bool,
    pub is_personal_best: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PlayerInputs {
    pub throttle: f32,
    pub brake: f32,
    pub clutch: f32,
    pub steering: f32,
    pub gear: i32,
    pub speed_kmh: i32,
    pub rpm: i32,
    pub max_rpm: i32,
    pub lateral_g: f32,
    pub longitudinal_g: f32,
    pub brake_bias_pct: Option<f32>,
    pub pit_limiter: bool,
    pub drs_active: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TireCorner {
    pub wear_pct: Option<f32>,
    pub temp_surface_c: Option<i32>,
    pub temp_core_c: Option<i32>,
    pub brake_temp_c: Option<i32>,
    pub pressure_kpa: Option<f32>,
    pub compound: Option<TireCompound>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TiresState {
    pub fl: TireCorner,
    pub fr: TireCorner,
    pub rl: TireCorner,
    pub rr: TireCorner,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct FuelState {
    pub level_liters: f32,
    pub capacity_liters: f32,
    pub per_lap_liters: f32,
    pub laps_remaining: Option<f32>,
    pub target_delta_liters: Option<f32>,
    pub virtual_energy_pct: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WeatherState {
    pub track_temp_c: i32,
    pub air_temp_c: i32,
    pub humidity_pct: i32,
    pub condition: TrackCondition,
    pub grip_pct: i32,
}

impl Default for WeatherState {
    fn default() -> Self {
        Self {
            track_temp_c: 25,
            air_temp_c: 20,
            humidity_pct: 50,
            condition: TrackCondition::Dry,
            grip_pct: 100,
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct VehicleTelemetry {
    pub tires: TiresState,
    pub fuel: FuelState,
    pub weather: WeatherState,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct TrackPoint {
    pub x: f32,
    pub z: f32,
}

#[derive(Debug, Clone)]
pub struct InputSample {
    pub throttle: f32,
    pub brake: f32,
    pub clutch: f32,
    pub lateral_g: f32,
    pub longitudinal_g: f32,
}

#[derive(Debug, Clone)]
pub struct TelemetryState {
    pub connected: bool,
    pub status_message: String,
    pub provider_name: String,
    pub session: SessionInfo,
    pub standings: Vec<StandingsEntry>,
    pub player_inputs: PlayerInputs,
    pub vehicle_telemetry: VehicleTelemetry,
    pub car_inputs_by_id: HashMap<String, PlayerInputs>,
    pub car_telemetry_by_id: HashMap<String, VehicleTelemetry>,
    pub track_map_points: Vec<TrackPoint>,
    pub focused_driver_id: Option<String>,
    pub input_history: VecDeque<InputSample>,
    pub live_delta_sec: f32,
}

impl Default for TelemetryState {
    fn default() -> Self {
        Self {
            connected: false,
            status_message: "Waiting for Le Mans Ultimate...".to_string(),
            provider_name: "lmu-rest".to_string(),
            session: SessionInfo::default(),
            standings: Vec::new(),
            player_inputs: PlayerInputs::default(),
            vehicle_telemetry: VehicleTelemetry::default(),
            car_inputs_by_id: HashMap::new(),
            car_telemetry_by_id: HashMap::new(),
            track_map_points: Vec::new(),
            focused_driver_id: None,
            input_history: VecDeque::with_capacity(240),
            live_delta_sec: 0.0,
        }
    }
}

impl TelemetryState {
    pub fn active_inputs(&self) -> &PlayerInputs {
        if let Some(ref id) = self.focused_driver_id {
            if let Some(inp) = self.car_inputs_by_id.get(id) {
                return inp;
            }
        }
        &self.player_inputs
    }

    pub fn active_telemetry(&self) -> &VehicleTelemetry {
        if let Some(ref id) = self.focused_driver_id {
            if let Some(tel) = self.car_telemetry_by_id.get(id) {
                return tel;
            }
        }
        &self.vehicle_telemetry
    }

    pub fn active_driver(&self) -> Option<&StandingsEntry> {
        if let Some(ref id) = self.focused_driver_id {
            if let Some(entry) = self.standings.iter().find(|s| &s.id == id) {
                return Some(entry);
            }
        }
        self.standings.iter().find(|s| s.is_player)
    }
}
