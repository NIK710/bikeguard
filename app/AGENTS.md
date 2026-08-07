# BikeGuard Mobile App Instructions

## Scope

This file applies to the BikeGuard React Native mobile app.

See the repository-level `AGENTS.md` for full system context.

## Stack

- React Native
- Expo
- Android physical device used for testing
- BLE connection to ESP32-S3

## Current BLE Status

Phone-to-ESP32 command communication works.

The recording implementation now also:

- Sends `START` and `STOP` through the command characteristic.
- Subscribes to the dedicated IMU notify characteristic before sending `START`.
- Validates seven-field text packets and buffers valid raw samples in memory.
- Assigns a timestamp-based numeric session ID.
- Appends every stopped recording to one `bikeguard-dataset.csv` file in Expo
  document storage.
- Offers the saved CSV through the native share sheet.

The latest successful milestone was testing arm/disarm behavior:

- The app sends an ARM command.
- ESP32 receives the command.
- The buzzer activates.
- DISARM reverses/deactivates the armed behavior.

Preserve the existing BLE connection and command path while adding data collection.

## App Responsibilities

The app is responsible for:

- Discovering / connecting to BikeGuard
- Sending control commands
- Arming/disarming the system
- Starting/stopping data recordings
- Subscribing to IMU notifications
- Parsing incoming IMU samples
- Buffering recording data
- Attaching labels
- Assigning session IDs
- Saving/exporting CSV
- Eventually displaying alerts and device state

## BLE Interface

Recommended architecture:

```text
App -> Command Characteristic -> ESP32

ARM
DISARM
START
STOP
```

UUIDs:

```text
Service:        7a1e0001-8e47-4a2b-9d8f-4c61247a1000
Command write:  7a1e0002-8e47-4a2b-9d8f-4c61247a1000
IMU notify:     7a1e0003-8e47-4a2b-9d8f-4c61247a1000
```

and:

```text
ESP32 -> IMU Notify Characteristic -> App

timestamp_ms,ax,ay,az,gx,gy,gz
```

The app subscribes to the IMU characteristic before sending `START`.

## Data Collection Workflow

Labeled IMU recording is implemented and is ready for physical-device validation.

Expected UI flow:

1. User connects to BikeGuard.
2. User selects an action.
3. User selects theft/no-theft.
4. User presses Start Recording.
5. App creates a new session ID.
6. App clears its recording buffer.
7. App subscribes to IMU notifications and sends `START`.
8. App collects and validates IMU notifications.
9. User presses Stop Recording.
10. App sends `STOP` and removes the notification subscription.
11. App attaches session and label metadata.
12. App appends the session to the dataset CSV and offers it through the share sheet.

## Recommended Labels

Possible action labels:

```text
stationary
normal_bump
lock_unlock
bike_moved
shaking
theft_attempt
```

Theft classification:

```text
0 = no theft
1 = theft
```

Keep `action` and `theft` as separate fields.

This allows more detailed behavior classification while still supporting a binary theft detector.

## CSV Format

Recommended schema:

```csv
session_id,timestamp_ms,accel_x,accel_y,accel_z,gyro_x,gyro_y,gyro_z,action,theft
```

Example:

```csv
27,0,0.21,-0.03,9.82,0.03,-0.01,0.02,shaking,1
27,20,0.29,0.15,9.76,0.08,-0.03,0.04,shaking,1
```

Every row from the same recording should share:
- `session_id`
- `action`
- `theft`

The timestamp should come from the ESP32 when possible.

## In-Memory Recording Model

A useful app-side representation is:

```ts
type ImuSample = {
  sessionId: number;
  timestampMs: number;
  accelX: number;
  accelY: number;
  accelZ: number;
  gyroX: number;
  gyroY: number;
  gyroZ: number;
  action: string;
  theft: 0 | 1;
};
```

During recording:
- keep samples in an array/buffer
- do not write the file for every BLE packet unless necessary
- save/append after the session ends

This keeps BLE handling lightweight.

## Recording UI

A simple first version is enough.

Suggested fields:

```text
Action:
[ dropdown / buttons ]

Classification:
[ No Theft ] [ Theft ]

Duration:
[ 5 seconds ]

[ START RECORDING ]
```

During recording show:
- Recording indicator
- Elapsed time
- Number of samples received
- Selected action
- Selected theft class

After recording show:
- Session ID
- Samples captured
- Save/export status

## Data Integrity

The app should:
- Ignore malformed BLE packets.
- Validate that seven sensor fields are present.
- Convert numeric strings safely.
- Avoid mixing samples between sessions.
- Prevent accidental duplicate recording starts.
- Stop collecting when the session ends.
- Keep session IDs unique.
- Preserve raw sensor values.

Do not calculate and save only acceleration magnitude or other derived features.

Those can be added later during preprocessing.

## Initial Sampling Expectations

Firmware is expected to sample at approximately 50 Hz.

For a 5-second recording:

```text
5 seconds x 50 Hz ~= 250 samples
```

Exact counts may vary slightly due to BLE timing.

The UI should not assume exactly 250 samples.

## File Strategy

The implemented file architecture is:

```text
ESP32
   |
   | BLE IMU notifications
   v
React Native app
   |
   | raw samples + labels
   v
CSV file
```

The CSV lives in the app's persistent document directory and can be exported
through the phone's native share sheet. Every recording appends rows to the same
`bikeguard-dataset.csv` file, with session IDs preserving recording boundaries.
Do not write CSV on the ESP32.

## Implementation Priorities

1. Preserve working ARM/DISARM commands — COMPLETE.
2. Subscribe to the ESP32 IMU notify characteristic — IMPLEMENTED.
3. Parse packets into structured raw samples — IMPLEMENTED.
4. Start/Stop Recording controls — IMPLEMENTED.
5. Action and theft/no-theft selectors — IMPLEMENTED.
6. Assign session IDs and buffer one session — IMPLEMENTED.
7. Append sessions to and share one dataset CSV — IMPLEMENTED.
8. Validate sustained recording and export on the physical Android device.
9. Add recording history / dataset management later.

## General Guidance

- Keep BLE service and characteristic UUIDs centralized in constants.
- Keep BLE transport logic separate from UI components.
- Keep recording state separate from device armed state.
- Do not couple buzzer state to data collection state.
- Prefer small, testable additions.
- Confirm each new BLE feature on the physical device before adding the next layer.
