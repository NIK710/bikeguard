#include <Arduino.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <BLEDevice.h>
#include <BLE2902.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <Wire.h>

#define SERVICE_UUID        "7a1e0001-8e47-4a2b-9d8f-4c61247a1000"
#define COMMAND_CHAR_UUID   "7a1e0002-8e47-4a2b-9d8f-4c61247a1000"
#define IMU_DATA_CHAR_UUID  "7a1e0003-8e47-4a2b-9d8f-4c61247a1000"
#define BUZZER_PIN 4
#define IMU_SDA_PIN 8
#define IMU_SCL_PIN 9

const unsigned long SAMPLE_INTERVAL_MS = 20;

Adafruit_MPU6050 mpu;
BLECharacteristic* imuDataCharacteristic = nullptr;

volatile bool armed = false;
volatile bool recording = false;
volatile bool deviceConnected = false;
bool imuReady = false;
unsigned long recordingStartMs = 0;
unsigned long lastSampleMs = 0;

class CommandCallbacks : public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic* characteristic) override {
        String command = String(characteristic->getValue().c_str());
        command.trim();

        Serial.print("Received command: ");
        Serial.println(command);

        if (command == "ARM") {
            armed = true;
            characteristic->setValue("ARMED");

            digitalWrite(BUZZER_PIN, HIGH);
            delay(300);
            digitalWrite(BUZZER_PIN, LOW);

            Serial.println("BikeGuard armed");
        }
        else if (command == "DISARM") {
            armed = false;
            characteristic->setValue("DISARMED");

            Serial.println("BikeGuard disarmed");
        }
        else if (command == "START") {
            if (!imuReady) {
                characteristic->setValue("IMU_NOT_READY");
                Serial.println("Cannot start recording: IMU is not ready");
                return;
            }

            recordingStartMs = millis();
            lastSampleMs = recordingStartMs - SAMPLE_INTERVAL_MS;
            recording = true;
            characteristic->setValue("RECORDING");

            Serial.println("IMU recording started");
        }
        else if (command == "STOP") {
            recording = false;
            characteristic->setValue("STOPPED");

            Serial.println("IMU recording stopped");
        }
        else {
            characteristic->setValue("UNKNOWN_COMMAND");
            Serial.println("Unknown command");
        }
    }
};

class ServerCallbacks : public BLEServerCallbacks {
    void onConnect(BLEServer* server) override {
        deviceConnected = true;
        Serial.println("Phone connected");
    }

    void onDisconnect(BLEServer* server) override {
        deviceConnected = false;
        recording = false;
        Serial.println("Phone disconnected");
        Serial.println("IMU recording stopped");

        delay(500);
        BLEDevice::startAdvertising();

        Serial.println("Advertising restarted");
    }
};

void setup() {
    Serial.begin(115200);
    delay(1000);

    pinMode(BUZZER_PIN, OUTPUT);
    digitalWrite(BUZZER_PIN, LOW);

    Wire.begin(IMU_SDA_PIN, IMU_SCL_PIN);
    imuReady = mpu.begin();

    if (imuReady) {
        mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
        mpu.setGyroRange(MPU6050_RANGE_500_DEG);
        mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
        Serial.println("MPU6050 ready");
    } else {
        Serial.println("MPU6050 not found; recording will remain unavailable");
    }

    Serial.println("Starting BikeGuard BLE...");

    BLEDevice::init("BikeGuard");
    BLEDevice::setMTU(185);

    BLEServer* server = BLEDevice::createServer();
    server->setCallbacks(new ServerCallbacks());

    BLEService* service = server->createService(SERVICE_UUID);

    BLECharacteristic* commandCharacteristic =
        service->createCharacteristic(
            COMMAND_CHAR_UUID,
            BLECharacteristic::PROPERTY_READ |
            BLECharacteristic::PROPERTY_WRITE
        );

    commandCharacteristic->setCallbacks(new CommandCallbacks());
    commandCharacteristic->setValue("DISARMED");

    imuDataCharacteristic = service->createCharacteristic(
        IMU_DATA_CHAR_UUID,
        BLECharacteristic::PROPERTY_NOTIFY
    );
    imuDataCharacteristic->addDescriptor(new BLE2902());

    service->start();

    BLEAdvertising* advertising = BLEDevice::getAdvertising();
    advertising->addServiceUUID(SERVICE_UUID);
    advertising->setScanResponse(true);
    advertising->start();

    Serial.println("BikeGuard is advertising");
    Serial.println("Initial state: DISARMED");
    Serial.print("IMU sample interval (ms): ");
    Serial.println(SAMPLE_INTERVAL_MS);
}

void loop() {
    if (!recording || !deviceConnected || !imuReady) {
        delay(1);
        return;
    }

    const unsigned long now = millis();

    if (now - lastSampleMs < SAMPLE_INTERVAL_MS) {
        delay(1);
        return;
    }

    lastSampleMs += SAMPLE_INTERVAL_MS;

    sensors_event_t accel;
    sensors_event_t gyro;
    sensors_event_t temperature;
    mpu.getEvent(&accel, &gyro, &temperature);

    char packet[128];
    snprintf(
        packet,
        sizeof(packet),
        "%lu,%.3f,%.3f,%.3f,%.3f,%.3f,%.3f",
        now - recordingStartMs,
        accel.acceleration.x,
        accel.acceleration.y,
        accel.acceleration.z,
        gyro.gyro.x,
        gyro.gyro.y,
        gyro.gyro.z
    );

    imuDataCharacteristic->setValue(packet);
    imuDataCharacteristic->notify();
    Serial.println(packet);
}
