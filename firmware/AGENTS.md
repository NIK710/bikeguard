# BikeGuard Firmware Instructions

## Scope

This file applies to the BikeGuard firmware running on the ESP32-S3.

The firmware is part of a larger system. See the repository-level `AGENTS.md` for full project context.

## Platform

- MCU: ESP32-S3
- PlatformIO board: `esp32-s3-devkitc-1`
- Framework: Arduino
- IDE: VS Code + PlatformIO
- Serial monitor: 115200 baud

## Sensors and Outputs

### MPU6050

The MPU6050 is connected over I2C and has been confirmed working.

Current ESP32-S3 I2C wiring:

```text
SDA = GPIO 8
SCL = GPIO 9
```

Initialize it explicitly with `Wire.begin(8, 9)` rather than relying on board
defaults.

Libraries:
```cpp
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
```

Typical event access:

```cpp
sensors_event_t accel, gyro, temp;
mpu.getEvent(&accel, &gyro, &temp);
```

Raw channels of interest:
- `accel.acceleration.x`
- `accel.acceleration.y`
- `accel.acceleration.z`
- `gyro.gyro.x`
- `gyro.gyro.y`
- `gyro.gyro.z`

Preserve these six raw values for dataset collection.

### Buzzer

A buzzer is used as the local alert output.

The latest successful hardware/software milestone was:

- Phone sent an ARM command over BLE.
- ESP32 received the command.
- ARM successfully activated the buzzer.
- DISARM successfully reversed/deactivated the armed state.

Do not break this working behavior while adding data collection.

## BLE Architecture

Use one BLE service with separate responsibilities for commands and telemetry.

Recommended structure:

```text
BikeGuard BLE Service
|
+-- Command Characteristic
|     Properties: WRITE
|
|     ARM
|     DISARM
|     START
|     STOP
|
+-- IMU Data Characteristic
      Properties: NOTIFY

      timestamp_ms,ax,ay,az,gx,gy,gz
```

Implemented UUIDs:

```text
Service:        7a1e0001-8e47-4a2b-9d8f-4c61247a1000
Command write:  7a1e0002-8e47-4a2b-9d8f-4c61247a1000
IMU notify:     7a1e0003-8e47-4a2b-9d8f-4c61247a1000
```

Keep command input and sensor output on separate characteristics.

## Device State

Firmware should maintain explicit state variables such as:

```cpp
bool armed = false;
bool recording = false;
```

Avoid encoding system behavior implicitly through GPIO state.

## IMU Recording

App-controlled data recording is implemented in firmware. `START` resets the
relative timestamp and begins streaming; `STOP` ends streaming. A disconnect
also stops recording. Physical-device validation should confirm sustained 50 Hz
delivery and exported sample counts.

Expected behavior:

- `START` begins IMU streaming.
- `STOP` ends IMU streaming.
- Recording should not interfere with ARM/DISARM command handling.
- The ESP32 does not need to know the ML labels initially.
- Labels belong in the mobile app.

Recommended initial sampling rate:

```cpp
const unsigned long SAMPLE_INTERVAL_MS = 20;
```

This corresponds to approximately 50 Hz.

Use non-blocking timing:

```cpp
if (recording && millis() - lastSample >= SAMPLE_INTERVAL_MS) {
    lastSample = millis();
    // sample IMU
}
```

Avoid using `delay(20)` for continuous sampling because it can interfere with BLE responsiveness.

## IMU Packet Format

For the first implementation, a simple text packet is acceptable:

```text
timestamp_ms,accel_x,accel_y,accel_z,gyro_x,gyro_y,gyro_z
```

Example:

```text
1240,0.21,-0.03,9.82,0.03,-0.01,0.02
```

The timestamp should preferably be relative to the beginning of the recording:

```cpp
timestamp = millis() - recordingStart;
```

Text packets are suitable for early debugging and dataset collection.

Binary packets can be considered later if BLE throughput becomes a bottleneck.

## Firmware Responsibilities

Firmware should:
- Initialize the MPU6050.
- Initialize BLE.
- Accept command writes.
- Maintain arm/disarm state.
- Control the buzzer.
- Maintain recording state.
- Sample the IMU at a fixed rate.
- Send IMU samples as BLE notifications.
- Print useful debug information over Serial.

Firmware should not initially:
- Write the final CSV.
- Assign action labels.
- Assign theft/no-theft labels.
- Perform heavy preprocessing.
- Compute ML features unless needed for later inference.

Those tasks are easier to manage in the app or offline tooling.

## Coding Style

- Prefer readable C++.
- Keep BLE callbacks short.
- Avoid blocking operations in callbacks.
- Prefer `millis()` timing.
- Use named constants for GPIO pins and timing values.
- Keep command parsing centralized.
- Keep IMU sampling logic separate from BLE command parsing.
- Keep buzzer behavior separate from IMU recording behavior.
- Do not add unnecessary dynamic memory allocation.
- Preserve Serial logging while developing.

## Suggested Next Implementation Sequence

1. Preserve working ARM/DISARM behavior — COMPLETE.
2. Recording state and `START`/`STOP` parsing — IMPLEMENTED.
3. Dedicated BLE notify characteristic and 50 Hz packets — IMPLEMENTED.
4. App notification buffering and CSV export — IMPLEMENTED.
5. Confirm the Android app receives sustained streams on physical hardware.
6. Compare expected versus exported sample counts for 5-10 second recordings.
7. Collect many labeled, bike-mounted sessions with consistent sensor mounting.
