#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>

#define SERVICE_UUID        "7a1e0001-8e47-4a2b-9d8f-4c61247a1000"
#define COMMAND_CHAR_UUID   "7a1e0002-8e47-4a2b-9d8f-4c61247a1000"
#define BUZZER_PIN 4

bool armed = false;

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
        else {
            characteristic->setValue("UNKNOWN_COMMAND");
            Serial.println("Unknown command");
        }
    }
};

class ServerCallbacks : public BLEServerCallbacks {
    void onConnect(BLEServer* server) override {
        Serial.println("Phone connected");
    }

    void onDisconnect(BLEServer* server) override {
        Serial.println("Phone disconnected");

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

    Serial.println("Starting BikeGuard BLE...");

    BLEDevice::init("BikeGuard");

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

    service->start();

    BLEAdvertising* advertising = BLEDevice::getAdvertising();
    advertising->addServiceUUID(SERVICE_UUID);
    advertising->setScanResponse(true);
    advertising->start();

    Serial.println("BikeGuard is advertising");
    Serial.println("Initial state: DISARMED");
}

void loop() {
    // The IMU sampling code will eventually run here.
    if (armed) {
        // Read and analyze IMU measurements for possible theft.
    } else {
        // The IMU may still be read, but theft detection is disabled.
    }

    delay(100);
}