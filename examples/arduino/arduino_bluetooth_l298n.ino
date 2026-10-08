/**
 * OmniRC - Exemplo Arduino Uno/Nano com Módulo Bluetooth HC-05/HC-06 e Ponte H L298N
 * 
 * Conexões:
 * HC-05 TX -> Pino 10 do Arduino (SoftwareSerial RX)
 * HC-05 RX -> Pino 11 do Arduino (via divisor de tensão 5V->3.3V)
 * Ponte H L298N:
 * IN1 -> Pino 4, IN2 -> Pino 5 (ENA PWM no pino 3)
 * IN3 -> Pino 7, IN4 -> Pino 8 (ENB PWM no pino 6)
 */

#include <SoftwareSerial.h>

SoftwareSerial BTSerial(10, 11); // RX, TX

// Pinos Ponte H
const int ENA = 3;
const int IN1 = 4;
const int IN2 = 5;
const int ENB = 6;
const int IN3 = 7;
const int IN4 = 8;
const int PIN_LED = 13;

unsigned long lastCmdTime = 0;
const unsigned long TIMEOUT_MS = 600;

void setMotors(int leftSpeed, int rightSpeed) {
  // Motor Esquerdo (-100 a +100)
  int pwmLeft = map(abs(leftSpeed), 0, 100, 0, 255);
  if (leftSpeed > 5) {
    digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW);
  } else if (leftSpeed < -5) {
    digitalWrite(IN1, LOW); digitalWrite(IN2, HIGH);
  } else {
    digitalWrite(IN1, LOW); digitalWrite(IN2, LOW);
  }
  analogWrite(ENA, pwmLeft);

  // Motor Direito (-100 a +100)
  int pwmRight = map(abs(rightSpeed), 0, 100, 0, 255);
  if (rightSpeed > 5) {
    digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW);
  } else if (rightSpeed < -5) {
    digitalWrite(IN3, LOW); digitalWrite(IN4, HIGH);
  } else {
    digitalWrite(IN3, LOW); digitalWrite(IN4, LOW);
  }
  analogWrite(ENB, pwmRight);
}

void stopMotors() {
  analogWrite(ENA, 0);
  analogWrite(ENB, 0);
  digitalWrite(IN1, LOW); digitalWrite(IN2, LOW);
  digitalWrite(IN3, LOW); digitalWrite(IN4, LOW);
}

void setup() {
  Serial.begin(9600);
  BTSerial.begin(9600); // Taxa padrão do módulo HC-05/HC-06

  pinMode(ENA, OUTPUT); pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT);
  pinMode(ENB, OUTPUT); pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);
  pinMode(PIN_LED, OUTPUT);
  stopMotors();

  Serial.println("Arduino pronto com modulo Bluetooth HC-05/HC-06!");
}

void loop() {
  if (BTSerial.available()) {
    String msg = BTSerial.readStringUntil('\n');
    msg.trim();
    if (msg.length() > 0) {
      lastCmdTime = millis();

      // Formato: DRIVE:X:Y (onde X é direção e Y é acelerador)
      if (msg.startsWith("DRIVE")) {
        int firstColon = msg.indexOf(':');
        int secondColon = msg.indexOf(':', firstColon + 1);
        if (secondColon > 0) {
          int x = msg.substring(firstColon + 1, secondColon).toInt();
          int y = msg.substring(secondColon + 1).toInt();

          // Mistura diferencial simples
          int left = constrain(y + x, -100, 100);
          int right = constrain(y - x, -100, 100);
          setMotors(left, right);
        }
      } else if (msg.equals("STOP") || msg.equals("S")) {
        stopMotors();
      } else if (msg.startsWith("LIGHT:")) {
        int v = msg.substring(6).toInt();
        digitalWrite(PIN_LED, v ? HIGH : LOW);
      }
    }
  }

  // Fail-Safe: Desliga motores se o Bluetooth desconectar
  if (millis() - lastCmdTime > TIMEOUT_MS) {
    stopMotors();
  }
}
