use crate::types::{PlayerInputs, TireCorner, TiresState};
use serde::Deserialize;
use std::net::UdpSocket;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

#[derive(Debug, Deserialize)]
struct RawUdpTire {
    #[serde(rename = "wearPct")]
    wear_pct: Option<f32>,
    #[serde(rename = "tempSurfaceC")]
    temp_surface_c: Option<f32>,
    #[serde(rename = "tempCoreC")]
    temp_core_c: Option<f32>,
}

#[derive(Debug, Deserialize)]
struct RawUdpPacket {
    throttle: Option<f32>,
    brake: Option<f32>,
    clutch: Option<f32>,
    steering: Option<f32>,
    gear: Option<i32>,
    #[serde(rename = "speedKmh")]
    speed_kmh: Option<f32>,
    rpm: Option<f32>,
    #[serde(rename = "maxRpm")]
    max_rpm: Option<f32>,
    #[serde(rename = "fuelLiters")]
    fuel_liters: Option<f32>,
    #[serde(rename = "fuelCapacity")]
    fuel_capacity: Option<f32>,
    tires: Option<Vec<RawUdpTire>>,
}

#[derive(Debug, Clone)]
pub struct UdpSample {
    pub received_at: Instant,
    pub inputs: PlayerInputs,
    pub fuel_liters: f32,
    pub fuel_capacity: f32,
    pub tires: TiresState,
}

pub fn parse_udp_packet(bytes: &[u8]) -> Option<UdpSample> {
    let raw: RawUdpPacket = serde_json::from_slice(bytes).ok()?;
    let clamp01 = |v: Option<f32>| v.unwrap_or(0.0).clamp(0.0, 1.0);

    let make_corner = |idx: usize| -> TireCorner {
        let t = raw.tires.as_ref().and_then(|v| v.get(idx));
        TireCorner {
            wear_pct: t.and_then(|x| x.wear_pct).map(|w| w.clamp(0.0, 100.0)),
            temp_surface_c: t.and_then(|x| x.temp_surface_c).map(|c| c.round() as i32),
            temp_core_c: t.and_then(|x| x.temp_core_c).map(|c| c.round() as i32),
            brake_temp_c: None,
            pressure_kpa: None,
            compound: None,
        }
    };

    Some(UdpSample {
        received_at: Instant::now(),
        inputs: PlayerInputs {
            throttle: clamp01(raw.throttle),
            brake: clamp01(raw.brake),
            clutch: clamp01(raw.clutch),
            steering: raw.steering.unwrap_or(0.0).clamp(-1.0, 1.0),
            gear: raw.gear.unwrap_or(0),
            speed_kmh: raw.speed_kmh.unwrap_or(0.0).max(0.0).round() as i32,
            rpm: raw.rpm.unwrap_or(0.0).max(0.0).round() as i32,
            max_rpm: raw.max_rpm.filter(|&m| m > 500.0).unwrap_or(8500.0).round() as i32,
            ..Default::default()
        },
        fuel_liters: raw.fuel_liters.unwrap_or(0.0).max(0.0),
        fuel_capacity: raw.fuel_capacity.filter(|&c| c > 0.0).unwrap_or(90.0),
        tires: TiresState {
            fl: make_corner(0),
            fr: make_corner(1),
            rl: make_corner(2),
            rr: make_corner(3),
        },
    })
}

pub struct UdpReceiver {
    latest: Arc<Mutex<Option<UdpSample>>>,
}

impl UdpReceiver {
    pub fn start(bind_addr: &str) -> Self {
        let latest = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&latest);
        let addr = bind_addr.to_string();

        thread::spawn(move || {
            let Ok(sock) = UdpSocket::bind(&addr) else {
                eprintln!("[BestLap Rust] Failed to bind UDP {addr}");
                return;
            };
            let _ = sock.set_read_timeout(Some(Duration::from_millis(500)));
            let mut buf = [0u8; 4096];
            loop {
                match sock.recv_from(&mut buf) {
                    Ok((len, _)) => {
                        if let Some(sample) = parse_udp_packet(&buf[..len]) {
                            if let Ok(mut guard) = slot.lock() {
                                *guard = Some(sample);
                            }
                        }
                    }
                    Err(e)
                        if e.kind() == std::io::ErrorKind::WouldBlock
                            || e.kind() == std::io::ErrorKind::TimedOut =>
                    {
                        continue;
                    }
                    Err(_) => thread::sleep(Duration::from_millis(200)),
                }
            }
        });

        Self { latest }
    }

    pub fn latest_if_fresh(&self) -> Option<UdpSample> {
        let guard = self.latest.lock().ok()?;
        let sample = guard.as_ref()?;
        if sample.received_at.elapsed() <= Duration::from_secs(2) {
            Some(sample.clone())
        } else {
            None
        }
    }
}
