import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Device, Subscription } from "react-native-ble-plx";

export const SERVICE_UUID = "7a1e0001-8e47-4a2b-9d8f-4c61247a1000";
export const COMMAND_CHAR_UUID = "7a1e0002-8e47-4a2b-9d8f-4c61247a1000";
export const IMU_DATA_CHAR_UUID = "7a1e0003-8e47-4a2b-9d8f-4c61247a1000";

export type TheftClassification = 0 | 1;

export type ImuSample = {
  sessionId: number;
  timestampMs: number;
  accelX: number;
  accelY: number;
  accelZ: number;
  gyroX: number;
  gyroY: number;
  gyroZ: number;
  action: string;
  theft: TheftClassification;
};

export type SavedRecording = {
  sessionId: number;
  sampleCount: number;
  fileName: string;
  fileUri: string;
};

type RecordingSessionOptions = {
  device: Device;
  action: string;
  theft: TheftClassification;
  onSampleCount: (count: number) => void;
  onMonitorError: (message: string) => void;
};

const CSV_HEADER =
  "session_id,timestamp_ms,accel_x,accel_y,accel_z,gyro_x,gyro_y,gyro_z,action,theft";
const DATASET_FILE_NAME = "bikeguard-dataset.csv";

function parsePacket(value: string | null): number[] | null {
  if (!value) {
    return null;
  }

  try {
    const fields = atob(value).split(",");

    if (fields.length !== 7) {
      return null;
    }

    const numbers = fields.map((field) => Number(field.trim()));

    return numbers.every(Number.isFinite) ? numbers : null;
  } catch {
    return null;
  }
}

export class RecordingSession {
  readonly sessionId = Date.now();

  private readonly device: Device;
  private readonly action: string;
  private readonly theft: TheftClassification;
  private readonly onSampleCount: (count: number) => void;
  private readonly onMonitorError: (message: string) => void;
  private readonly samples: ImuSample[] = [];
  private monitorSubscription: Subscription | null = null;
  private stopped = false;
  private invalidPacketCount = 0;

  get hasStopped() {
    return this.stopped;
  }

  constructor(options: RecordingSessionOptions) {
    this.device = options.device;
    this.action = options.action;
    this.theft = options.theft;
    this.onSampleCount = options.onSampleCount;
    this.onMonitorError = options.onMonitorError;
  }

  async start() {
    this.monitorSubscription = this.device.monitorCharacteristicForService(
      SERVICE_UUID,
      IMU_DATA_CHAR_UUID,
      (error, characteristic) => {
        if (error) {
          this.onMonitorError(error.message);
          return;
        }

        const values = parsePacket(characteristic?.value ?? null);

        if (!values) {
          this.invalidPacketCount += 1;
          return;
        }

        const [timestampMs, accelX, accelY, accelZ, gyroX, gyroY, gyroZ] =
          values;

        this.samples.push({
          sessionId: this.sessionId,
          timestampMs,
          accelX,
          accelY,
          accelZ,
          gyroX,
          gyroY,
          gyroZ,
          action: this.action,
          theft: this.theft,
        });
        this.onSampleCount(this.samples.length);
      }
    );

    try {
      await this.sendCommand("START");
    } catch (error) {
      this.monitorSubscription.remove();
      this.monitorSubscription = null;
      void this.device
        .writeCharacteristicWithResponseForService(
          SERVICE_UUID,
          COMMAND_CHAR_UUID,
          btoa("STOP")
        )
        .catch((stopError) => {
          console.log("Recording cleanup command error:", stopError);
        });
      throw error;
    }
  }

  async stop(): Promise<SavedRecording> {
    await this.sendCommand("STOP");
    this.monitorSubscription?.remove();
    this.monitorSubscription = null;
    this.stopped = true;

    if (this.samples.length === 0) {
      throw new Error(
        this.invalidPacketCount > 0
          ? `No valid IMU samples were received. ${this.invalidPacketCount} malformed BLE packets were ignored.`
          : "No IMU notifications were received. Check the firmware connection and IMU notify characteristic."
      );
    }

    const file = new File(Paths.document, DATASET_FILE_NAME);
    const rows = this.samples.map((sample) =>
      [
        sample.sessionId,
        sample.timestampMs,
        sample.accelX,
        sample.accelY,
        sample.accelZ,
        sample.gyroX,
        sample.gyroY,
        sample.gyroZ,
        sample.action,
        sample.theft,
      ].join(",")
    );

    if (!file.exists) {
      file.create();
      file.write([CSV_HEADER, ...rows].join("\n") + "\n");
    } else {
      file.write(rows.join("\n") + "\n", { append: true });
    }

    return {
      sessionId: this.sessionId,
      sampleCount: this.samples.length,
      fileName: DATASET_FILE_NAME,
      fileUri: file.uri,
    };
  }

  cancel() {
    this.monitorSubscription?.remove();
    this.monitorSubscription = null;

    if (!this.stopped) {
      this.stopped = true;
      void this.device
        .writeCharacteristicWithResponseForService(
          SERVICE_UUID,
          COMMAND_CHAR_UUID,
          btoa("STOP")
        )
        .catch((error) => {
          console.log("Recording cancellation error:", error);
        });
    }
  }

  private async sendCommand(command: "START" | "STOP") {
    await this.device.writeCharacteristicWithResponseForService(
      SERVICE_UUID,
      COMMAND_CHAR_UUID,
      btoa(command)
    );

    if (command === "START") {
      const response = await this.device.readCharacteristicForService(
        SERVICE_UUID,
        COMMAND_CHAR_UUID
      );
      const status = response.value ? atob(response.value) : "";

      if (status !== "RECORDING") {
        throw new Error(
          status === "IMU_NOT_READY"
            ? "The BikeGuard IMU is not ready. Check its wiring and restart the device."
            : `BikeGuard did not start recording (${status || "no status"}).`
        );
      }
    }
  }
}

export async function shareRecording(recording: SavedRecording) {
  const sharingAvailable = await Sharing.isAvailableAsync();

  if (!sharingAvailable) {
    throw new Error("File sharing is not available on this device.");
  }

  await Sharing.shareAsync(recording.fileUri, {
    dialogTitle: "Export BikeGuard recording",
    mimeType: "text/csv",
    UTI: "public.comma-separated-values-text",
  });
}
