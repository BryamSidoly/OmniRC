/*
 * OmniRC - Ponte MSP (MultiWii Serial Protocol) para INAV e Betaflight
 * 
 * Este exemplo roda em um ESP32 e comunica com controladoras dedicadas de voo
 * (SpeedyBee F405 WING, Matek Systems F405-WING, F722-WING, Omnibus F4)
 * executando o firmware INAV (para asas e aviões) ou Betaflight (para drones de corrida).
 * 
 * O app OmniRC transmite via Wi-Fi UDP ou Bluetooth pacotes MSP_SET_RAW_RC (msg #200)
 * contendo 8 canais de controle em microssegundos:
 * Roll, Pitch, Throttle, Yaw, AUX1 (ARM), AUX2 (Modo), AUX3 (Flaps/Beeper), AUX4 (Gear/Turtle).
 */

#include <WiFi.h>
#include <WiFiUdp.h>

// --- CONFIGURAÇÃO DE REDE WI-FI ---
const char* ssid = "OmniRC-INAV-Bridge";
const char* password = "password123";
const int udpPort = 8888;
WiFiUDP udp;

// --- COMUNICAÇÃO SERIAL COM A CONTROLADORA DE VOO ---
// RX2 (GPIO 16) -> Conectado ao TX da UART livre da controladora (ex: UART2 ou UART6)
// TX2 (GPIO 17) -> Conectado ao RX da UART livre da controladora
#define FC_BAUD_RATE 115200 // Taxa MSP padrão no INAV/Betaflight

HardwareSerial fcSerial(2);

void setup() {
    Serial.begin(115200);
    Serial.println("\n[OmniRC] Inicializando Ponte MSP INAV / Betaflight...");

    // Inicializar comunicação serial com a controladora
    fcSerial.begin(FC_BAUD_RATE, SERIAL_8N1, 16, 17);

    // Inicializar Ponto de Acesso Wi-Fi no ESP32
    WiFi.softAP(ssid, password);
    Serial.print("[Wi-Fi AP] IP Criado: ");
    Serial.println(WiFi.softAPIP());

    udp.begin(udpPort);
    Serial.printf("[UDP] Aguardando comandos na porta %d...\n", udpPort);
}

void loop() {
    uint8_t packetBuffer[256];

    // 1. Receber pacotes MSP do OmniRC via UDP e repassar para a controladora de voo
    int packetSize = udp.parsePacket();
    if (packetSize > 0) {
        int bytesRead = udp.read(packetBuffer, sizeof(packetBuffer));
        if (bytesRead > 0) {
            // Verificar cabeçalho MSP v1: "$M<" (0x24 0x4D 0x3C)
            if (bytesRead >= 6 && packetBuffer[0] == 0x24 && packetBuffer[1] == 0x4D && packetBuffer[2] == 0x3C) {
                fcSerial.write(packetBuffer, bytesRead);
            }
        }
    }

    // 2. Repassar telemetria serial da controladora de voo de volta (se houver cliente conectado)
    if (fcSerial.available() > 0) {
        int len = fcSerial.readBytes(packetBuffer, min(fcSerial.available(), (int)sizeof(packetBuffer)));
        if (udp.remotePort() > 0 && len > 0) {
            udp.beginPacket(udp.remoteIP(), udp.remotePort());
            udp.write(packetBuffer, len);
            udp.endPacket();
        }
    }
}
