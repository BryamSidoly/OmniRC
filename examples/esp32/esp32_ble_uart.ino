/**
 * OmniRC - Exemplo ESP32 Bluetooth Low Energy (BLE) Nordic UART Service
 * 
 * Compatível com o scanner BLE do OmniRC (detecta automaticamente o serviço NUS).
 */

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// UUIDs padrão Nordic UART Service (NUS) usados pelo OmniRC
#define SERVICE_UUID           "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
#define CHARACTERISTIC_UUID_RX "6E400002-B5A3-F393-E0A9-E50E24DCCA9E" // Write do App
#define CHARACTERISTIC_UUID_TX "6E400003-B5A3-F393-E0A9-E50E24DCCA9E" // Notify para o App

BLEServer *pServer = NULL;
BLECharacteristic *pTxCharacteristic;
bool deviceConnected = false;

class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
      deviceConnected = true;
      Serial.println("[BLE] Dispositivo conectado!");
    };
    void onDisconnect(BLEServer* pServer) {
      deviceConnected = false;
      Serial.println("[BLE] Dispositivo desconectado!");
      BLEDevice::startAdvertising(); // Reinicia anúncio
    }
};

class MyCallbacks: public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic *pCharacteristic) {
      String rxValue = pCharacteristic->getValue().c_str();
      if (rxValue.length() > 0) {
        rxValue.trim();
        Serial.printf("[BLE RX]: %s\n", rxValue.c_str());

        // Processar comando recebido do OmniRC
        if (rxValue.startsWith("DRIVE:")) {
          // Processar direção e acelerador
        } else if (rxValue.equals("STOP")) {
          // Parar motores
        }
      }
    }
};

void setup() {
  Serial.begin(115200);

  // Inicializa o BLE com o nome local
  BLEDevice::init("OmniRC_BLE");
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  // Cria o Serviço Nordic UART
  BLEService *pService = pServer->createService(SERVICE_UUID);

  // Cria a Característica TX (para enviar telemetria ao celular)
  pTxCharacteristic = pService->createCharacteristic(
                        CHARACTERISTIC_UUID_TX,
                        BLECharacteristic::PROPERTY_NOTIFY
                      );
  pTxCharacteristic->addDescriptor(new BLE2902());

  // Cria a Característica RX (onde o OmniRC escreve os comandos)
  BLECharacteristic *pRxCharacteristic = pService->createCharacteristic(
                                           CHARACTERISTIC_UUID_RX,
                                           BLECharacteristic::PROPERTY_WRITE
                                         );
  pRxCharacteristic->setCallbacks(new MyCallbacks());

  pService->start();

  // Inicia anúncio BLE
  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x06);
  pAdvertising->setMinPreferred(0x12);
  BLEDevice::startAdvertising();
  Serial.println("[BLE] Anúncio Nordic UART iniciado! Procure 'OmniRC_BLE' no app.");
}

void loop() {
  // Enviar telemetria de volta a cada 2 segundos se conectado
  if (deviceConnected) {
    // String telemetria = "BATT:98%,TEMP:28C\n";
    // pTxCharacteristic->setValue(telemetria.c_str());
    // pTxCharacteristic->notify();
    // delay(2000);
  }
  delay(10);
}
