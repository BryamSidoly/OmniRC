/**
 * OmniRC - Exemplo ESP32 Bluetooth Classic SPP (Serial Port Profile)
 * 
 * Pareie o celular no menu Bluetooth do Android com "OmniRC_ESP32".
 * Abra o app OmniRC -> Conexão -> Bluetooth Classic -> Conectar.
 */

#include "BluetoothSerial.h"

BluetoothSerial SerialBT;

const int PIN_FAROL = 2;
unsigned long lastMsgTime = 0;
const unsigned long TIMEOUT_MS = 600;

void setup() {
  Serial.begin(115200);
  pinMode(PIN_FAROL, OUTPUT);

  // Inicia o Bluetooth SPP com o nome que aparecerá no celular
  SerialBT.begin("OmniRC_ESP32");
  Serial.println("\n[BT] Bluetooth iniciado! Pareie com 'OmniRC_ESP32' no celular.");
}

void loop() {
  if (SerialBT.available()) {
    String msg = SerialBT.readStringUntil('\n');
    msg.trim();
    if (msg.length() > 0) {
      lastMsgTime = millis();
      Serial.println("[BT RX]: " + msg);

      // Decodificação básica do comando (ex: DRIVE:X:Y ou LIGHT:1)
      if (msg.startsWith("DRIVE:")) {
        int firstColon = msg.indexOf(':');
        int secondColon = msg.indexOf(':', firstColon + 1);
        if (secondColon > 0) {
          int x = msg.substring(firstColon + 1, secondColon).toInt();
          int y = msg.substring(secondColon + 1).toInt();
          Serial.printf("Comando Drive -> Dir: %d%% | Acel: %d%%\n", x, y);
          // Acionar motores...
        }
      } else if (msg.startsWith("LIGHT:")) {
        int val = msg.substring(6).toInt();
        digitalWrite(PIN_FAROL, val ? HIGH : LOW);
      } else if (msg.equals("STOP") || msg.equals("S")) {
        Serial.println("EMERGENCY STOP ACIONADO!");
        // Parar motores...
      }

      // Exemplo de Envio de Telemetria de volta para o OmniRC:
      // O app exibe no Terminal tudo o que o microcontrolador responder!
      // SerialBT.println("STATUS:OK,BATT:95%");
    }
  }

  // Fail-Safe
  if (millis() - lastMsgTime > TIMEOUT_MS) {
    // Parar motores...
  }
}
