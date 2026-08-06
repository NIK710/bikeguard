#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>

#define SERVICE_UUID "7a1e0001-8e47-4a2b-9d8f-4c61247a1000"

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

    Serial.println("Starting BikeGuard BLE...");

    // This becomes the device name shown by the phone.
    BLEDevice::init("BikeGuard");

    // Create a BLE server and one BikeGuard service.
    BLEServer* server = BLEDevice::createServer();
    server->setCallbacks(new ServerCallbacks());

    BLEService* service = server->createService(SERVICE_UUID);

    service->start();

    // Advertise the service so nearby phones can discover it.
    BLEAdvertising* advertising = BLEDevice::getAdvertising();
    advertising->addServiceUUID(SERVICE_UUID);
    advertising->setScanResponse(true);

    BLEDevice::startAdvertising();

    Serial.println("BikeGuard is advertising");
}

void loop() {
    // Nothing else is needed for the discovery test.
    delay(1000);
}