/*
 * OmniRC - Ponte Wi-Fi / Bluetooth para ArduPilot & Pixhawk (MAVLink v1/v2)
 * 
 * Este exemplo roda em um ESP32 e atua como modem de telemetria sem fio
 * conectado à porta TELEM1 ou TELEM2 de uma controladora Pixhawk, Cube Orange,
 * SpeedyBee F405 WING ou Matek H743 rodando ArduPilot (ArduPlane / ArduCopter / ArduRover).
 * 
 * O app OmniRC se conecta via Wi-Fi UDP na porta 8888 (ou 14550 padrão MAVLink)
 * e transmite comandos de controle via pacote RC_CHANNELS_OVERRIDE (#70).
 */

#include <WiFi.h>
#include <WiFiUdp.h>

// --- CONFIGURAÇÃO WI-FI ---
const char* apSsid = "OmniRC-Pixhawk";
const char* apPass = "password123";
const int udpPort = 8888;
WiFiUDP udp;

// --- PORTA SERIAL CONECTADA AO PIXHAWK TELEM ---
// RX2 (GPIO 16) -> TX do Pixhawk TELEM
// TX2 (GPIO 17) -> RX do Pixhawk TELEM
#define FC_SERIAL_BAUD 57600 // Padrão TELEM1/TELEM2 do ArduPilot

HardwareSerial fcSerial(2);

IPAddress remoteClientIp;
uint16_t remoteClientPort = 0;
bool clientConnected = false;

unsigned long lastHeartbeat = 0;

// Envia Heartbeat MAVLink v1 (msg #0) a cada 1 segundo para manter o link ativo
void sendGcsHeartbeat() {
    // MAVLink v1 Heartbeat para GCS:
    // [0xFE] [Len 9] [Seq] [SysID 255] [CompID 190] [MsgID 0] [Payload 9 bytes] [CRC 2 bytes]
    static uint8_t seq = 0;
    uint8_t hbPacket[17] = {
        0xFE, 9, seq++, 255, 190, 0,
        0x00, 0x00, 0x00, 0x00, // custom_mode (uint32)
        0x06,                   // type: MAV_TYPE_GCS (6)
        0x08,                   // autopilot: MAV_AUTOPILOT_INVALID (8)
        0x00,                   // base_mode
        0x03,                   // system_status: MAV_STATE_ACTIVE (3)
        0x03,                   // mavlink_version: 3
        0x00, 0x00             // CRC placeholder
    };

    // Calcular CRC X.25 com seed 50
    uint16_t crc = 0xFFFF;
    for (int i = 1; i < 15; i++) {
        uint8_t tmp = hbPacket[i] ^ (crc & 0xFF);
        tmp ^= (tmp << 4) & 0xFF;
        crc = ((crc >> 8) ^ (tmp << 8) ^ (tmp << 3) ^ (tmp >> 4)) & 0xFFFF;
    }
    uint8_t tmp = 50 ^ (crc & 0xFF);
    tmp ^= (tmp << 4) & 0xFF;
    crc = ((crc >> 8) ^ (tmp << 8) ^ (tmp << 3) ^ (tmp >> 4)) & 0xFFFF;

    hbPacket[15] = crc & 0xFF;
    hbPacket[16] = (crc >> 8) & 0xFF;

    fcSerial.write(hbPacket, 17);
}

void setup() {
    Serial.begin(115200);
    Serial.println("\n[OmniRC] Inicializando Ponte MAVLink Pixhawk...");

    // Porta UART conectada ao Pixhawk
    fcSerial.begin(FC_SERIAL_BAUD, SERIAL_8N1, 16, 17);

    // Inicializar Ponto de Acesso Wi-Fi
    WiFi.softAP(apSsid, apPass);
    Serial.print("[Wi-Fi AP] IP: ");
    Serial.println(WiFi.softAPIP());

    udp.begin(udpPort);
    Serial.printf("[UDP] Aguardando conexão OmniRC na porta %d...\n", udpPort);
}

void loop() {
    uint8_t buffer[512];

    // 1. Receber dados do OmniRC via UDP e repassar para a controladora Pixhawk
    int packetSize = udp.parsePacket();
    if (packetSize > 0) {
        remoteClientIp = udp.remoteIP();
        remoteClientPort = udp.remotePort();
        clientConnected = true;

        int len = udp.read(buffer, sizeof(buffer));
        if (len > 0) {
            fcSerial.write(buffer, len);
        }
    }

    // 2. Receber telemetria do Pixhawk via UART e repassar para o app OmniRC via UDP
    int bytesFromFc = fcSerial.available();
    if (bytesFromFc > 0) {
        int len = fcSerial.readBytes(buffer, min(bytesFromFc, (int)sizeof(buffer)));
        if (clientConnected && len > 0) {
            udp.beginPacket(remoteClientIp, remoteClientPort);
            udp.write(buffer, len);
            udp.endPacket();
        }
    }

    // 3. Manter Heartbeat ativo
    if (millis() - lastHeartbeat >= 1000) {
        lastHeartbeat = millis();
        sendGcsHeartbeat();
    }
}
