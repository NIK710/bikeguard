# BikeGuard Project Instructions

## Project Overview

BikeGuard is an embedded bike-theft detection and alert system built as a personal project.

The system combines:
- An ESP32-S3 microcontroller
- An MPU6050 IMU
- A buzzer for local alerts
- A battery / portable power source
- A React Native mobile app
- BLE communication between the phone and ESP32-S3
- Future TinyML-based theft classification

The goal is to detect suspicious movement or tampering while a bike is parked, distinguish theft-like behavior from normal movement, alert the owner, and optionally trigger a buzzer.

## Repository Structure

```text
bikeguard/
├── AGENTS.md
├── firmware/
│   ├── AGENTS.md
│   └── src/
├── app/
│   ├── AGENTS.md
│   └── ...
└── data/
```

## System Architecture

```text
React Native App
        |
        | BLE commands
        v
    ESP32-S3
        |
        +---- MPU6050 IMU
        |
        +---- Buzzer
```

The app is responsible for:
- Connecting to BikeGuard over BLE
- Arming/disarming the device
- Starting/stopping labeled IMU recordings
- Receiving IMU samples
- Assigning labels to recordings
- Saving/exporting data for ML training

The ESP32-S3 is responsible for:
- BLE communication
- Reading the MPU6050
- Controlling the buzzer
- Sampling and transmitting IMU data
- Eventually running theft-detection inference on-device

## Current Hardware

- ESP32-S3 DevKitC-1
- MPU6050 / GY-521 IMU
- Buzzer
- Breadboard / jumper wiring
- Portable power source for bike testing

## Current Development Stack

### Firmware
- VS Code
- PlatformIO
- Arduino framework
- Board: `esp32-s3-devkitc-1`
- Adafruit MPU6050 library
- Adafruit Sensor library

### Mobile App
- React Native
- Expo
- Android physical device
- BLE communication with ESP32-S3

## Current BLE Functionality

Phone-to-ESP32 BLE commands are working.

The latest completed milestone was testing the arm/disarm command path.

Confirmed behavior:
- The phone can send an ARM command to the ESP32-S3.
- The ESP32-S3 receives the command.
- ARM activates the buzzer.
- DISARM stops/deactivates the armed behavior.
- This confirms end-to-end phone -> BLE -> ESP32 -> output control.

Do not redesign this working command path unnecessarily.

## Current Priority

The next major feature is labeled IMU data collection.

Desired workflow:

1. User selects an action label in the app.
2. User selects theft / no-theft classification.
3. User starts a recording.
4. The app sends a start-recording command to the ESP32.
5. ESP32 samples the MPU6050 at a fixed rate.
6. ESP32 sends samples to the phone over BLE notifications.
7. The app records the samples for the requested interval.
8. The app attaches the selected labels.
9. The app saves or exports the data as CSV.

Recommended sample rate for initial experiments:
- 50 Hz
- 20 ms between samples

Recommended CSV schema:

```csv
session_id,timestamp_ms,accel_x,accel_y,accel_z,gyro_x,gyro_y,gyro_z,action,theft
```

Example labels may include:
- stationary
- normal_bump
- lock_unlock
- bike_moved
- shaking
- theft_attempt

The `theft` field should use a consistent binary representation such as:
- `0` = no theft
- `1` = theft

Each recording session must have a unique `session_id`.

## Data Collection Principles

- Preserve raw accelerometer and gyroscope values.
- Do not replace raw measurements with derived features.
- Derived values such as acceleration magnitude can be calculated later during preprocessing.
- Keep the physical sensor mounting position consistent during the first dataset collection phase.
- Record many separate sessions rather than one extremely long recording.
- Keep session boundaries so train/test splits can be performed by session later.
- Avoid leaking samples from the same physical recording into both training and test sets.

## Design Philosophy

Keep the system split into two major subsystems:

### Hardware / Firmware
Responsible for sensing, device control, BLE communication, power, and eventual on-device inference.

### Mobile Software
Responsible for user controls, labeling, dataset collection, storage/export, alerts, and visualization.

Avoid putting responsibilities on the ESP32 that are easier and safer to handle in the app during development.

## Coding Guidance

- Prefer simple, readable implementations over unnecessary abstraction.
- Preserve already-working BLE behavior while adding new features.
- Avoid long blocking delays in firmware.
- Prefer `millis()`-based timing for sampling and device state.
- Keep BLE command handling separate from continuous IMU streaming.
- Introduce a dedicated BLE characteristic for IMU notifications rather than overloading the command characteristic.
- Make changes incrementally and keep each milestone testable on hardware.

## Near-Term Roadmap

1. Arm/disarm BLE + buzzer control — COMPLETE
2. Add IMU recording start/stop state
3. Add ESP32 -> phone BLE notification characteristic
4. Stream timestamped IMU samples
5. Add app-side recording buffer
6. Add action + theft labels
7. Save/export CSV
8. Collect bike-mounted dataset
9. Analyze signals and define preprocessing
10. Train baseline classifier
11. Evaluate false positives / false negatives
12. Deploy a compact model to ESP32-S3
