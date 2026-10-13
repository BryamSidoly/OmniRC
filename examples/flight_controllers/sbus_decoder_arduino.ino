/*
 * OmniRC - Decodificador SBUS (Futaba / FrSky / RadioMaster) para Arduino
 * 
 * Este exemplo recebe quadros seriais SBUS de 25 bytes enviados pelo app OmniRC
 * (via módulo Bluetooth HC-05/HC-06 conectado aos pinos Serial ou USB-OTG)
 * e decodifica até 16 canais de 11 bits, gerando pulsos PWM para Servos tradicionais.
 * 
 * Compatível com: Arduino Uno, Nano, Mega 2560, Pro Mini.
 * Aplicação: Aeromodelos clássicos, planadores, robôs com receptor serial.
 */

#include <Servo.h>

// --- PINOS DOS SERVOS ---
#define PIN_SERVO_AIL   9    // Aileron (Canal 1)
#define PIN_SERVO_ELE   10   // Profundor / Elevator (Canal 2)
#define PIN_ESC_THR     11   // Motor ESC / Throttle (Canal 3)
#define PIN_SERVO_RUD   6    // Leme / Rudder (Canal 4)
#define PIN_SERVO_AUX1  5    // Canal Auxiliar 1 (Canal 5)

Servo servoAil;
Servo servoEle;
Servo escThr;
Servo servoRud;
Servo servoAux1;

// Buffer de canais decodificados (1000 a 2000 microssegundos)
uint16_t rcChannels[16] = {1500, 1500, 1000, 1500, 1000, 1000, 1000, 1000, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500};
uint8_t sbusBuffer[25];
uint8_t sbusIndex = 0;
unsigned long lastPacketTime = 0;
const unsigned long FAILSAFE_TIMEOUT_MS = 500;

// Decodifica o quadro SBUS de 25 bytes (16 canais de 11 bits)
void parseSbusFrame(const uint8_t *frame) {
    // Cabeçalho: 0x0F, Rodapé: 0x00
    if (frame[0] != 0x0F) return;

    uint16_t rawCh[16];
    const uint8_t *payload = &frame[1];

    rawCh[0]  = (payload[0]       | (payload[1] << 8)) & 0x07FF;
    rawCh[1]  = ((payload[1] >> 3)| (payload[2] << 5)) & 0x07FF;
    rawCh[2]  = ((payload[2] >> 6)| (payload[3] << 2) | (payload[4] << 10)) & 0x07FF;
    rawCh[3]  = ((payload[4] >> 1)| (payload[5] << 7)) & 0x07FF;
    rawCh[4]  = ((payload[5] >> 4)| (payload[6] << 4)) & 0x07FF;
    rawCh[5]  = ((payload[6] >> 7)| (payload[7] << 1) | (payload[8] << 9)) & 0x07FF;
    rawCh[6]  = ((payload[8] >> 2)| (payload[9] << 6)) & 0x07FF;
    rawCh[7]  = ((payload[9] >> 5)| (payload[10] << 3)) & 0x07FF;
    rawCh[8]  = (payload[11]      | (payload[12] << 8)) & 0x07FF;
    rawCh[9]  = ((payload[12] >> 3)| (payload[13] << 5)) & 0x07FF;
    rawCh[10] = ((payload[13] >> 6)| (payload[14] << 2) | (payload[15] << 10)) & 0x07FF;
    rawCh[11] = ((payload[15] >> 1)| (payload[16] << 7)) & 0x07FF;
    rawCh[12] = ((payload[16] >> 4)| (payload[17] << 4)) & 0x07FF;
    rawCh[13] = ((payload[17] >> 7)| (payload[18] << 1) | (payload[19] << 9)) & 0x07FF;
    rawCh[14] = ((payload[19] >> 2)| (payload[20] << 6)) & 0x07FF;
    rawCh[15] = ((payload[20] >> 5)| (payload[21] << 3)) & 0x07FF;

    // Converter escala SBUS (172..1811) para microssegundos (1000..2000 us)
    for (int i = 0; i < 16; i++) {
        rcChannels[i] = map(rawCh[i], 172, 1811, 1000, 2000);
        rcChannels[i] = constrain(rcChannels[i], 1000, 2000);
    }

    lastPacketTime = millis();
}

void applyPwmOutputs() {
    servoAil.writeMicroseconds(rcChannels[0]);
    servoEle.writeMicroseconds(rcChannels[1]);
    escThr.writeMicroseconds(rcChannels[2]);
    servoRud.writeMicroseconds(rcChannels[3]);
    servoAux1.writeMicroseconds(rcChannels[4]);
}

void applyFailsafe() {
    escThr.writeMicroseconds(1000); // Corta motor imediatamente
    servoAil.writeMicroseconds(1500);
    servoEle.writeMicroseconds(1500);
    servoRud.writeMicroseconds(1500);
}

void setup() {
    // 115200 bps (ou 100000 bps para receptores SBUS físicos invertidos)
    Serial.begin(115200);

    servoAil.attach(PIN_SERVO_AIL, 1000, 2000);
    servoEle.attach(PIN_SERVO_ELE, 1000, 2000);
    escThr.attach(PIN_ESC_THR, 1000, 2000);
    servoRud.attach(PIN_SERVO_RUD, 1000, 2000);
    servoAux1.attach(PIN_SERVO_AUX1, 1000, 2000);

    applyFailsafe();
}

void loop() {
    while (Serial.available()) {
        uint8_t b = Serial.read();

        if (sbusIndex == 0) {
            if (b == 0x0F) { // Início do quadro SBUS
                sbusBuffer[sbusIndex++] = b;
            }
        } else {
            sbusBuffer[sbusIndex++] = b;
            if (sbusIndex == 25) {
                parseSbusFrame(sbusBuffer);
                applyPwmOutputs();
                sbusIndex = 0;
            }
        }
    }

    // Failsafe por perda de sinal
    if (millis() - lastPacketTime > FAILSAFE_TIMEOUT_MS) {
        applyFailsafe();
    }
}
