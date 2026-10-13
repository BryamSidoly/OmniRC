/*
 * OmniRC - Decodificador CRSF (ExpressLRS / TBS Crossfire) para ESP32
 * 
 * Este exemplo recebe pacotes CRSF via Wi-Fi UDP, Bluetooth Classic ou Serial/USB
 * do app OmniRC e converte os canais em sinais PWM tradicionais (1000 a 2000 us)
 * para acionar Servos de aeromodelos e ESCs de motor diretamente pelas GPIOs.
 * 
 * Compatível com: ESP32 NodeMCU, ESP32-WROOM, ESP32-S3, ESP32-C3.
 * Aplicação: Asas voadoras, aeromodelos escala, barcos e robôs com controle CRSF/ELRS.
 */

#include <WiFi.h>
#include <WiFiUdp.h>
#include <ESP32Servo.h>

// --- CONFIGURAÇÃO DE REDE WI-FI ---
const char* ssid = "OmniRC-Plane";
const char* password = "password123";
const int udpPort = 8888;
WiFiUDP udp;

// --- PINOS DE SAÍDA PWM PARA SERVOS / ESC ---
#define PIN_SERVO_AIL   18   // Aileron (Canal 1)
#define PIN_SERVO_ELE   19   // Profundor / Elevator (Canal 2)
#define PIN_ESC_THR     21   // Motor ESC / Throttle (Canal 3)
#define PIN_SERVO_RUD   22   // Leme / Rudder (Canal 4)
#define PIN_SERVO_AUX1  23   // Flaps / AUX (Canal 5 ou 6)

// Objetos Servo (ESP32Servo library)
Servo servoAil;
Servo servoEle;
Servo escThr;
Servo servoRud;
Servo servoAux1;

// Buffer de canais decodificados em microssegundos (1000..2000 us)
uint16_t rcChannels[16] = {1500, 1500, 1000, 1500, 1000, 1000, 1000, 1000, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500};
unsigned long lastPacketTime = 0;
const unsigned long FAILSAFE_TIMEOUT_MS = 500; // Corta motor se ficar 500ms sem sinal

// Tabela de CRC8 DVB-S2 (Polinômio 0xD5)
uint8_t crsfCrc8(const uint8_t *data, uint8_t len) {
    uint8_t crc = 0;
    for (uint8_t i = 0; i < len; i++) {
        crc ^= data[i];
        for (uint8_t j = 0; j < 8; j++) {
            if (crc & 0x80) {
                crc = (crc << 1) ^ 0xD5;
            } else {
                crc = crc << 1;
            }
        }
    }
    return crc;
}

// Decodifica quadro CRSF de 26 bytes
bool parseCrsfFrame(const uint8_t *buf, int len) {
    // Quadro CRSF RC: [0xC8 Sync] [24 Len] [0x16 Type] [22 bytes payload] [CRC8]
    if (len < 26) return false;
    if (buf[0] != 0xC8 || buf[1] != 24 || buf[2] != 0x16) return false;

    // Validação CRC8 sobre Type + Payload (23 bytes)
    uint8_t expectedCrc = crsfCrc8(&buf[2], 23);
    if (buf[25] != expectedCrc) {
        Serial.println("[CRSF] Erro de CRC8!");
        return false;
    }

    // Desempacotar 16 canais de 11 bits dos 22 bytes do payload
    const uint8_t *payload = &buf[3];
    uint16_t rawChannels[16];

    rawChannels[0]  = (payload[0]       | (payload[1] << 8)) & 0x07FF;
    rawChannels[1]  = ((payload[1] >> 3)| (payload[2] << 5)) & 0x07FF;
    rawChannels[2]  = ((payload[2] >> 6)| (payload[3] << 2) | (payload[4] << 10)) & 0x07FF;
    rawChannels[3]  = ((payload[4] >> 1)| (payload[5] << 7)) & 0x07FF;
    rawChannels[4]  = ((payload[5] >> 4)| (payload[6] << 4)) & 0x07FF;
    rawChannels[5]  = ((payload[6] >> 7)| (payload[7] << 1) | (payload[8] << 9)) & 0x07FF;
    rawChannels[6]  = ((payload[8] >> 2)| (payload[9] << 6)) & 0x07FF;
    rawChannels[7]  = ((payload[9] >> 5)| (payload[10] << 3)) & 0x07FF;
    rawChannels[8]  = (payload[11]      | (payload[12] << 8)) & 0x07FF;
    rawChannels[9]  = ((payload[12] >> 3)| (payload[13] << 5)) & 0x07FF;
    rawChannels[10] = ((payload[13] >> 6)| (payload[14] << 2) | (payload[15] << 10)) & 0x07FF;
    rawChannels[11] = ((payload[15] >> 1)| (payload[16] << 7)) & 0x07FF;
    rawChannels[12] = ((payload[16] >> 4)| (payload[17] << 4)) & 0x07FF;
    rawChannels[13] = ((payload[17] >> 7)| (payload[18] << 1) | (payload[19] << 9)) & 0x07FF;
    rawChannels[14] = ((payload[19] >> 2)| (payload[20] << 6)) & 0x07FF;
    rawChannels[15] = ((payload[20] >> 5)| (payload[21] << 3)) & 0x07FF;

    // Converter escala CRSF (172..1811) para microssegundos PWM (988..2012 us)
    for (int i = 0; i < 16; i++) {
        rcChannels[i] = map(rawChannels[i], 172, 1811, 988, 2012);
        rcChannels[i] = constrain(rcChannels[i], 988, 2012);
    }

    lastPacketTime = millis();
    return true;
}

void applyPwmOutputs() {
    // Mapeamento padrão AETR: CH0=Ail, CH1=Ele, CH2=Thr, CH3=Rud
    servoAil.writeMicroseconds(rcChannels[0]);
    servoEle.writeMicroseconds(rcChannels[1]);
    escThr.writeMicroseconds(rcChannels[2]);
    servoRud.writeMicroseconds(rcChannels[3]);
    servoAux1.writeMicroseconds(rcChannels[4]);
}

void applyFailsafe() {
    // Corta o motor e centraliza superfícies de comando
    escThr.writeMicroseconds(1000);
    servoAil.writeMicroseconds(1500);
    servoEle.writeMicroseconds(1500);
    servoRud.writeMicroseconds(1500);
}

void setup() {
    Serial.begin(115200);
    Serial.println("\n[OmniRC] Iniciando Receptor CRSF / ELRS...");

    // Configurar temporizadores de PWM para os servos (ESP32Servo)
    ESP32PWM::allocateTimer(0);
    ESP32PWM::allocateTimer(1);
    ESP32PWM::allocateTimer(2);
    ESP32PWM::allocateTimer(3);

    servoAil.setPeriodHertz(50);
    servoEle.setPeriodHertz(50);
    escThr.setPeriodHertz(50);
    servoRud.setPeriodHertz(50);
    servoAux1.setPeriodHertz(50);

    servoAil.attach(PIN_SERVO_AIL, 1000, 2000);
    servoEle.attach(PIN_SERVO_ELE, 1000, 2000);
    escThr.attach(PIN_ESC_THR, 1000, 2000);
    servoRud.attach(PIN_SERVO_RUD, 1000, 2000);
    servoAux1.attach(PIN_SERVO_AUX1, 1000, 2000);

    applyFailsafe();

    // Inicializar Ponto de Acesso Wi-Fi
    WiFi.softAP(ssid, password);
    Serial.print("[Wi-Fi AP] IP: ");
    Serial.println(WiFi.softAPIP());

    udp.begin(udpPort);
    Serial.printf("[UDP] Escutando porta %d...\n", udpPort);
}

void loop() {
    uint8_t packetBuffer[128];

    // 1. Verificar pacotes recebidos via UDP
    int packetSize = udp.parsePacket();
    if (packetSize > 0) {
        int bytesRead = udp.read(packetBuffer, sizeof(packetBuffer));
        if (parseCrsfFrame(packetBuffer, bytesRead)) {
            applyPwmOutputs();
        }
    }

    // 2. Verificar pacotes recebidos via Serial / USB-OTG
    if (Serial.available() >= 26) {
        int bytesRead = Serial.readBytes(packetBuffer, 26);
        if (parseCrsfFrame(packetBuffer, bytesRead)) {
            applyPwmOutputs();
        }
    }

    // 3. Failsafe: segurança caso o transmissor perca a conexão
    if (millis() - lastPacketTime > FAILSAFE_TIMEOUT_MS) {
        applyFailsafe();
    }
}
