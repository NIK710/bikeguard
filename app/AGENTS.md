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

and:

```text
ESP32 -> IMU Notify Characteristic -> App

timestamp_ms,ax,ay,az,gx,gy,gz
```

The app should subscribe to the IMU characteristic before or when recording begins.

## Data Collection Workflow

The next major feature is labeled IMU recording.

Expected UI flow:

1. User connects to BikeGuard.
2. User selects an action.
3. User selects theft/no-theft.
4. User selects or uses a recording duration.
5. User presses Start Recording.
6. App creates a new session ID.
7. App clears its recording buffer.
8. App sends `START`.
9. App collects IMU notifications.
10. App stops after the requested interval.
11. App sends `STOP`.
12. App attaches session and label metadata.
13. App appends the data to a CSV dataset.

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

During development, the preferred architecture is:

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

The CSV should live on or be exported from the phone rather than being generated on the ESP32.

## Implementation Priorities

1. Preserve working ARM/DISARM commands.
2. Subscribe to an ESP32 IMU notify characteristic.
3. Log received packets to the app console.
4. Parse them into structured samples.
5. Add Start/Stop Recording.
6. Add action selector.
7. Add theft/no-theft selector.
8. Assign session IDs.
9. Buffer samples for one session.
10. Export/append CSV.
11. Add recording history / dataset management later.

## General Guidance

- Keep BLE service and characteristic UUIDs centralized in constants.
- Keep BLE transport logic separate from UI components.
- Keep recording state separate from device armed state.
- Do not couple buzzer state to data collection state.
- Prefer small, testable additions.
- Confirm each new BLE feature on the physical device before adding the next layer.
