/*
 * BestLap Wine/Proton Shared Memory -> UDP Bridge for Le Mans Ultimate / rFactor 2
 * Compile on Linux with:
 *   x86_64-w64-mingw32-gcc -O2 bridge/lmu_shm_bridge.c -o bridge/lmu_shm_bridge.exe -lws2_32
 */
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <winsock2.h>
#include <stdio.h>
#include <stdint.h>
#include <math.h>

#define SHM_NAME "$rFactor2SMMP_Telemetry$"
#define TARGET_HOST "127.0.0.1"
#define TARGET_PORT 20778

static double read_f64(const uint8_t *base, size_t offset) {
    double v = 0.0;
    memcpy(&v, base + offset, sizeof(double));
    return isfinite(v) ? v : 0.0;
}

static int32_t read_i32(const uint8_t *base, size_t offset) {
    int32_t v = 0;
    memcpy(&v, base + offset, sizeof(int32_t));
    return v;
}

static uint32_t read_u32(const uint8_t *base, size_t offset) {
    uint32_t v = 0;
    memcpy(&v, base + offset, sizeof(uint32_t));
    return v;
}

int main(void) {
    WSADATA wsa;
    if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) {
        fprintf(stderr, "[BestLap Bridge] WSAStartup failed\n");
        return 1;
    }

    SOCKET sock = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_port = htons(TARGET_PORT);
    addr.sin_addr.s_addr = inet_addr(TARGET_HOST);

    printf("[BestLap Bridge] Waiting for %s ...\n", SHM_NAME);
    HANDLE hMap = NULL;
    const uint8_t *view = NULL;

    for (;;) {
        if (!view) {
            hMap = OpenFileMappingA(FILE_MAP_READ, FALSE, SHM_NAME);
            if (hMap) {
                view = (const uint8_t *)MapViewOfFile(hMap, FILE_MAP_READ, 0, 0, 0);
                if (view) {
                    printf("[BestLap Bridge] Connected to %s -> UDP %s:%d\n", SHM_NAME, TARGET_HOST, TARGET_PORT);
                } else {
                    CloseHandle(hMap);
                    hMap = NULL;
                }
            }
            if (!view) {
                Sleep(500);
                continue;
            }
        }

        uint32_t beginVer = read_u32(view, 0);
        uint32_t endVer = read_u32(view, 4);
        if (beginVer != endVer) {
            Sleep(2);
            continue;
        }

        // rF2Telemetry: header is 16 bytes (begin, end, bytesHint, numVehicles),
        // followed by rF2VehicleTelemetry mVehicles[128] (1888 bytes each, #pragma pack(4)).
        int32_t numVehicles = read_i32(view, 12);
        if (numVehicles <= 0) {
            Sleep(16);
            continue;
        }

        const uint8_t *veh = view + 16;
        double velX = read_f64(veh, 184);
        double velY = read_f64(veh, 192);
        double velZ = read_f64(veh, 200);
        double speedKmh = sqrt(velX * velX + velY * velY + velZ * velZ) * 3.6;
        int32_t gear = read_i32(veh, 352);
        double rpm = read_f64(veh, 356);
        double throttle = read_f64(veh, 388); // mUnfilteredThrottle
        double brake = read_f64(veh, 396);    // mUnfilteredBrake
        double steering = read_f64(veh, 404); // mUnfilteredSteering
        double clutch = read_f64(veh, 412);   // mUnfilteredClutch
        double fuel = read_f64(veh, 524);     // mFuel (liters)
        double maxRpm = read_f64(veh, 532);   // mEngineMaxRPM
        double fuelCap = read_f64(veh, 608);  // mFuelCapacity (liters)

        double wear[4], surfTempC[4], coreTempC[4];
        for (int i = 0; i < 4; i++) {
            size_t wOff = 848 + (size_t)i * 260;
            double surfK = read_f64(veh, wOff + 136); // mTemperature[1] (center)
            double coreK = read_f64(veh, wOff + 204); // mTireCarcassTemperature
            wear[i] = read_f64(veh, wOff + 152) * 100.0; // mWear (0..1)
            surfTempC[i] = surfK > 100.0 ? (surfK - 273.15) : 0.0;
            coreTempC[i] = coreK > 100.0 ? (coreK - 273.15) : surfTempC[i];
        }

        char json[640];
        int len = snprintf(
            json, sizeof(json),
            "{\"throttle\":%.3f,\"brake\":%.3f,\"clutch\":%.3f,\"steering\":%.3f,"
            "\"gear\":%d,\"speedKmh\":%.1f,\"rpm\":%.0f,\"maxRpm\":%.0f,"
            "\"fuelLiters\":%.2f,\"fuelCapacity\":%.1f,"
            "\"tires\":[{\"wearPct\":%.1f,\"tempSurfaceC\":%.0f,\"tempCoreC\":%.0f},"
            "{\"wearPct\":%.1f,\"tempSurfaceC\":%.0f,\"tempCoreC\":%.0f},"
            "{\"wearPct\":%.1f,\"tempSurfaceC\":%.0f,\"tempCoreC\":%.0f},"
            "{\"wearPct\":%.1f,\"tempSurfaceC\":%.0f,\"tempCoreC\":%.0f}]}",
            throttle, brake, clutch, steering,
            gear, speedKmh, rpm, maxRpm,
            fuel, fuelCap,
            wear[0], surfTempC[0], coreTempC[0],
            wear[1], surfTempC[1], coreTempC[1],
            wear[2], surfTempC[2], coreTempC[2],
            wear[3], surfTempC[3], coreTempC[3]
        );

        if (len > 0) {
            sendto(sock, json, len, 0, (struct sockaddr *)&addr, sizeof(addr));
        }

        Sleep(16); // ~60 Hz
    }

    return 0;
}
