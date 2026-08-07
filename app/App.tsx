import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  PermissionsAndroid,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { BleManager, Device, State } from "react-native-ble-plx";
import { SafeAreaView } from "react-native-safe-area-context";
import RecordingScreen from "./RecordingScreen";
import { COMMAND_CHAR_UUID, SERVICE_UUID } from "./recordingSession";

export default function App() {
  const [bleManager] = useState(() => new BleManager());
  const [bluetoothState, setBluetoothState] = useState<State>(
    State.Unknown
  );
  const [devices, setDevices] = useState<Device[]>([]);
  const [scanning, setScanning] = useState(false);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);

  const [armed, setArmed] = useState(false);
  const [sendingCommand, setSendingCommand] = useState(false);
  const [currentPage, setCurrentPage] = useState<"home" | "recording">(
    "home"
  );

  useEffect(() => {
    const subscription = bleManager.onStateChange((state) => {
      setBluetoothState(state);
    }, true);

    return () => {
      subscription.remove();
      void bleManager.destroy().catch((error) => {
        console.log("BLE cleanup error:", error);
      });
    };
  }, [bleManager]);

  async function requestBluetoothPermissions(): Promise<boolean> {
    if (Platform.OS !== "android") {
      return true;
    }

    if (Number(Platform.Version) >= 31) {
      const results = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ]);

      return (
        results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] ===
          PermissionsAndroid.RESULTS.GRANTED &&
        results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] ===
          PermissionsAndroid.RESULTS.GRANTED
      );
    }

    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
    );

    return result === PermissionsAndroid.RESULTS.GRANTED;
  }

  async function startScan() {
    const permissionsGranted = await requestBluetoothPermissions();

    if (!permissionsGranted) {
      Alert.alert(
        "Permission required",
        "BikeGuard needs Bluetooth permission to find nearby devices."
      );
      return;
    }

    if (bluetoothState !== State.PoweredOn) {
      Alert.alert(
        "Bluetooth is off",
        "Turn on Bluetooth and try scanning again."
      );
      return;
    }

    setDevices([]);
    setScanning(true);

    bleManager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        console.log("BLE scan error:", error);
        setScanning(false);
        Alert.alert("Scan error", error.message);
        return;
      }

      if (!device) {
        return;
      }

      setDevices((currentDevices) => {
        const alreadyFound = currentDevices.some(
          (currentDevice) => currentDevice.id === device.id
        );

        return alreadyFound
          ? currentDevices
          : [...currentDevices, device];
      });
    });

    setTimeout(() => {
      bleManager.stopDeviceScan();
      setScanning(false);
    }, 10000);
  }

  function stopScan() {
    bleManager.stopDeviceScan();
    setScanning(false);
  }

  async function connectToDevice(device: Device) {
    try {
      bleManager.stopDeviceScan();
      setScanning(false);
      setConnectingId(device.id);

      // Clear a stale connection before trying again.
      const alreadyConnected = await device.isConnected();

      if (alreadyConnected) {
        await device.cancelConnection();
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 500);
        });
      }

      const connected = await bleManager.connectToDevice(device.id, {
        autoConnect: false,
        timeout: 10000,
      });

      if (Platform.OS === "android") {
        await connected.requestMTU(185);
      }

      await connected.discoverAllServicesAndCharacteristics();

      const services = await connected.services();

      const bikeGuardService = services.find(
        (service) =>
          service.uuid.toLowerCase() ===
          "7a1e0001-8e47-4a2b-9d8f-4c61247a1000"
      );

      if (!bikeGuardService) {
        await connected.cancelConnection();
        throw new Error("The BikeGuard BLE service was not found.");
      }

      setConnectedDevice(connected);

      connected.onDisconnected((error) => {
        setConnectedDevice(null);
        setCurrentPage("home");

        if (error) {
          console.log("BLE disconnection error:", error);
          Alert.alert("Disconnected", error.message);
        }
      });
    } catch (error) {
      console.log("BLE connection error:", error);

      const message =
        error instanceof Error ? error.message : "Unable to connect.";

      Alert.alert("Connection failed", message);
    } finally {
      setConnectingId(null);
    }
  }

  async function disconnectDevice() {
    if (!connectedDevice) {
      return;
    }

    try {
      await connectedDevice.cancelConnection();
      setConnectedDevice(null);
      setCurrentPage("home");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to disconnect.";

      Alert.alert("Disconnect failed", message);
    }
  }

  async function sendArmCommand() {
    if (!connectedDevice) {
      Alert.alert("Not connected", "Connect to BikeGuard first.");
      return;
    }

    const command = armed ? "DISARM" : "ARM";

    try {
      setSendingCommand(true);

      await connectedDevice.writeCharacteristicWithResponseForService(
        SERVICE_UUID,
        COMMAND_CHAR_UUID,
        btoa(command)
      );

      setArmed(command === "ARM");
    } catch (error) {
      console.log("Command error:", error);

      const message =
        error instanceof Error ? error.message : "Unable to send command.";

      Alert.alert("Command failed", message);
    } finally {
      setSendingCommand(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      {currentPage === "recording" && connectedDevice ? (
        <RecordingScreen
          device={connectedDevice}
          onBack={() => setCurrentPage("home")}
        />
      ) : (
        <>

      <Text style={styles.title}>BikeGuard</Text>
      <Text style={styles.status}>
        Bluetooth: {bluetoothState}
      </Text>

      <Pressable
        style={[styles.button, scanning && styles.stopButton]}
        onPress={scanning ? stopScan : startScan}
      >
        <Text style={styles.buttonText}>
          {scanning ? "Stop scanning" : "Scan for devices"}
        </Text>
      </Pressable>

      {connectedDevice ? (
        <View style={styles.connectedBox}>
          <Text style={styles.connectedText}>
            Connected to {connectedDevice.name ?? "BikeGuard"}
          </Text>

          <Text style={armed ? styles.armedStatus : styles.disarmedStatus}>
            System: {armed ? "ARMED" : "DISARMED"}
          </Text>

          <Pressable
            style={[styles.armButton, armed && styles.disarmButton]}
            onPress={sendArmCommand}
            disabled={sendingCommand}
          >
            <Text style={styles.buttonText}>
              {sendingCommand
                ? "Sending..."
                : armed
                  ? "Disarm BikeGuard"
                  : "Arm BikeGuard"}
            </Text>
          </Pressable>

          <Pressable
            style={styles.recordingPageButton}
            onPress={() => setCurrentPage("recording")}
          >
            <Text style={styles.buttonText}>Record IMU data</Text>
          </Pressable>

          <Pressable style={styles.disconnectButton} onPress={disconnectDevice}>
            <Text style={styles.buttonText}>Disconnect</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={styles.connectionHint}>
          Scan and tap BikeGuard to connect.
        </Text>
      )}

      <FlatList
        data={devices}
        keyExtractor={(device) => device.id}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {scanning
              ? "Searching for nearby BLE devices..."
              : "No devices found yet."}
          </Text>
        }
        renderItem={({ item }) => {
          const deviceName =
            item.localName ?? item.name ?? "Unnamed BLE device";
          const isConnecting = connectingId === item.id;
          const isConnected = connectedDevice?.id === item.id;

          return (
            <Pressable
              style={[
                styles.deviceCard,
                isConnected && styles.connectedCard,
              ]}
              onPress={() => connectToDevice(item)}
              disabled={connectingId !== null || isConnected}
            >
              <Text style={styles.deviceName}>{deviceName}</Text>
              <Text style={styles.deviceId}>{item.id}</Text>
              <Text style={styles.signal}>
                Signal: {item.rssi ?? "unknown"}
              </Text>

              <Text style={styles.deviceAction}>
                {isConnecting
                  ? "Connecting..."
                  : isConnected
                    ? "Connected"
                    : "Tap to connect"}
              </Text>
            </Pressable>
          );
        }}
      />
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f7f6",
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    color: "#163c2e",
  },
  status: {
    marginTop: 8,
    marginBottom: 20,
    fontSize: 16,
    color: "#52615b",
  },
  button: {
    backgroundColor: "#1f7a55",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    marginBottom: 20,
  },
  stopButton: {
    backgroundColor: "#a33d3d",
  },
  buttonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  deviceCard: {
    backgroundColor: "white",
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
  },
  deviceName: {
    fontSize: 17,
    fontWeight: "600",
    color: "#17211d",
  },
  deviceId: {
    marginTop: 5,
    fontSize: 12,
    color: "#68756f",
  },
  signal: {
    marginTop: 5,
    color: "#68756f",
  },
  emptyText: {
    textAlign: "center",
    marginTop: 40,
    color: "#68756f",
  },

  connectionHint: {
    marginBottom: 16,
    color: "#68756f",
  },
  connectedBox: {
    backgroundColor: "#dff3e8",
    borderColor: "#1f7a55",
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
  },
  connectedText: {
    color: "#155c3f",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
  },
  disconnectButton: {
    backgroundColor: "#a33d3d",
    borderRadius: 8,
    padding: 10,
    alignItems: "center",
  },
  connectedCard: {
    borderColor: "#1f7a55",
    borderWidth: 2,
  },
  deviceAction: {
    marginTop: 10,
    color: "#1f7a55",
    fontWeight: "600",
  },
  armedStatus: {
    color: "#a33d3d",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
  },
  disarmedStatus: {
    color: "#52615b",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
  },
  armButton: {
    backgroundColor: "#a33d3d",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
    marginBottom: 10,
  },
  disarmButton: {
    backgroundColor: "#1f7a55",
  },
  recordingPageButton: {
    backgroundColor: "#315f85",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
    marginBottom: 10,
  },
});
