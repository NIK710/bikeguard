import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Device } from "react-native-ble-plx";
import {
  RecordingSession,
  SavedRecording,
  shareRecording,
  TheftClassification,
} from "./recordingSession";

const ACTION_LABELS = [
  "stationary",
  "normal_bump",
  "lock_unlock",
  "bike_moved",
  "shaking",
  "theft_attempt",
] as const;

type RecordingScreenProps = {
  device: Device;
  onBack: () => void;
};

export default function RecordingScreen({
  device,
  onBack,
}: RecordingScreenProps) {
  const [action, setAction] = useState<(typeof ACTION_LABELS)[number]>(
    ACTION_LABELS[0]
  );
  const [theft, setTheft] = useState<TheftClassification>(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [sendingCommand, setSendingCommand] = useState(false);
  const [sampleCount, setSampleCount] = useState(0);
  const [savedRecording, setSavedRecording] =
    useState<SavedRecording | null>(null);
  const sessionRef = useRef<RecordingSession | null>(null);

  useEffect(() => {
    return () => sessionRef.current?.cancel();
  }, []);

  async function toggleRecording() {
    setSendingCommand(true);

    try {
      if (!recording) {
        setSampleCount(0);
        setSavedRecording(null);

        const session = new RecordingSession({
          device,
          action,
          theft,
          onSampleCount: setSampleCount,
          onMonitorError: (message) => {
            console.log("IMU notification error:", message);
          },
        });

        await session.start();
        sessionRef.current = session;
        setRecording(true);
      } else {
        const session = sessionRef.current;
        const result = await session?.stop();

        sessionRef.current = null;
        setRecording(false);

        if (result) {
          setSavedRecording(result);
        }
      }
    } catch (error) {
      console.log("Recording error:", error);

      if (sessionRef.current?.hasStopped) {
        sessionRef.current = null;
        setRecording(false);
      }

      const message =
        error instanceof Error ? error.message : "Unable to record IMU data.";

      Alert.alert("Recording failed", message);
    } finally {
      setSendingCommand(false);
    }
  }

  async function shareCsv() {
    if (!savedRecording) {
      return;
    }

    try {
      await shareRecording(savedRecording);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to share CSV file.";

      Alert.alert("Share failed", message);
    }
  }

  return (
    <View style={styles.screen}>
      <Pressable
        accessibilityRole="button"
        disabled={recording || sendingCommand}
        onPress={onBack}
        style={styles.backButton}
      >
        <Text style={[styles.backText, recording && styles.disabledText]}>
          ← Back
        </Text>
      </Pressable>

      <Text style={styles.title}>Record IMU data</Text>
      <Text style={styles.subtitle}>
        Connected to {device.name ?? "BikeGuard"}
      </Text>

      <Text style={styles.label}>Action label</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: dropdownOpen }}
        disabled={recording}
        onPress={() => setDropdownOpen((open) => !open)}
        style={styles.dropdownButton}
      >
        <Text style={styles.dropdownText}>{action}</Text>
        <Text style={styles.dropdownArrow}>{dropdownOpen ? "▲" : "▼"}</Text>
      </Pressable>

      {dropdownOpen && !recording ? (
        <View style={styles.dropdownMenu}>
          {ACTION_LABELS.map((label) => (
            <Pressable
              accessibilityRole="button"
              key={label}
              onPress={() => {
                setAction(label);
                setDropdownOpen(false);
              }}
              style={[
                styles.dropdownOption,
                label === action && styles.selectedOption,
              ]}
            >
              <Text style={styles.dropdownText}>{label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <Text style={styles.label}>Classification</Text>
      <View style={styles.classificationRow}>
        {([0, 1] as const).map((value) => {
          const selected = theft === value;
          const label = value === 0 ? "No theft" : "Theft";

          return (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              disabled={recording}
              key={value}
              onPress={() => setTheft(value)}
              style={[
                styles.classificationButton,
                selected && styles.selectedClassification,
              ]}
            >
              <Text
                style={[
                  styles.classificationText,
                  selected && styles.selectedClassificationText,
                ]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.summary}>
        <Text style={styles.summaryText}>Action: {action}</Text>
        <Text style={styles.summaryText}>
          Classification: {theft === 1 ? "Theft (1)" : "No theft (0)"}
        </Text>
        <Text style={styles.summaryText}>Samples: {sampleCount}</Text>
      </View>

      <Pressable
        accessibilityRole="button"
        disabled={sendingCommand}
        onPress={toggleRecording}
        style={[styles.recordButton, recording && styles.stopButton]}
      >
        <Text style={styles.recordButtonText}>
          {sendingCommand
            ? "Working..."
            : recording
              ? "Stop and save CSV"
              : "Start recording"}
        </Text>
      </Pressable>

      {recording ? (
        <Text style={styles.recordingStatus}>● Recording {sampleCount} samples</Text>
      ) : null}

      {savedRecording ? (
        <View style={styles.savedBox}>
          <Text style={styles.savedTitle}>Session added to dataset</Text>
          <Text style={styles.savedText}>{savedRecording.fileName}</Text>
          <Text style={styles.savedText}>
            Session {savedRecording.sessionId} · {savedRecording.sampleCount} samples
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={shareCsv}
            style={styles.shareButton}
          >
            <Text style={styles.shareButtonText}>Share CSV</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  backButton: { alignSelf: "flex-start", paddingVertical: 8, marginBottom: 16 },
  backText: { color: "#1f7a55", fontSize: 16, fontWeight: "600" },
  disabledText: { color: "#9aa39f" },
  title: { fontSize: 30, fontWeight: "700", color: "#163c2e" },
  subtitle: { marginTop: 6, marginBottom: 16, color: "#52615b", fontSize: 16 },
  label: { marginTop: 14, marginBottom: 8, color: "#17211d", fontSize: 16, fontWeight: "600" },
  dropdownButton: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderColor: "#9aa9a2", borderWidth: 1, borderRadius: 10, backgroundColor: "white", padding: 14 },
  dropdownText: { color: "#17211d", fontSize: 16 },
  dropdownArrow: { color: "#52615b", fontSize: 12 },
  dropdownMenu: { borderColor: "#9aa9a2", borderWidth: 1, borderTopWidth: 0, borderBottomLeftRadius: 10, borderBottomRightRadius: 10, overflow: "hidden", backgroundColor: "white" },
  dropdownOption: { paddingHorizontal: 14, paddingVertical: 10 },
  selectedOption: { backgroundColor: "#dff3e8" },
  classificationRow: { flexDirection: "row", gap: 10 },
  classificationButton: { flex: 1, alignItems: "center", borderColor: "#9aa9a2", borderWidth: 1, borderRadius: 10, backgroundColor: "white", padding: 14 },
  selectedClassification: { borderColor: "#1f7a55", backgroundColor: "#dff3e8" },
  classificationText: { color: "#52615b", fontSize: 16, fontWeight: "600" },
  selectedClassificationText: { color: "#155c3f" },
  summary: { marginTop: 20, borderRadius: 10, backgroundColor: "#e8eeeb", padding: 14, gap: 6 },
  summaryText: { color: "#35433d" },
  recordButton: { marginTop: 20, alignItems: "center", borderRadius: 10, backgroundColor: "#a33d3d", padding: 16 },
  stopButton: { backgroundColor: "#6f2727" },
  recordButtonText: { color: "white", fontSize: 17, fontWeight: "700" },
  recordingStatus: { marginTop: 12, textAlign: "center", color: "#a33d3d", fontSize: 16, fontWeight: "700" },
  savedBox: { marginTop: 16, borderColor: "#1f7a55", borderWidth: 1, borderRadius: 10, backgroundColor: "#dff3e8", padding: 14 },
  savedTitle: { color: "#155c3f", fontSize: 17, fontWeight: "700" },
  savedText: { marginTop: 5, color: "#35433d" },
  shareButton: { marginTop: 12, alignItems: "center", borderRadius: 8, backgroundColor: "#315f85", padding: 11 },
  shareButtonText: { color: "white", fontSize: 16, fontWeight: "600" },
});
