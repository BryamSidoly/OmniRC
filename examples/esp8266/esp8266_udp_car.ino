/**
 * OmniRC - Exemplo ESP8266 (NodeMCU / D1 Mini) Wi-Fi UDP
 * 
 * Placa econômica muito usada em projetos IoT e robótica educacional.
 */

#include <ESP8266WiFi.h>
#include <WiFiUdp.h>

const char* ssid = "OmniRC_ESP8266";
const char* password = "adminpassword";

WiFiUDP udp;
const unsigned int localPort = 8888;
char packetBuffer[255];

// Pinos Ponte H (NodeMCU D1, D2, D5, D6)
const int PIN_D1 = D1;
const int PIN_D2 = D2;
const int PIN_D5 = D5;
const int PIN_D6 = D6;

unsigned long lastTime = 0;
const unsigned long TIMEOUT_MS = 600;

void setMotors(int left, int right) {
  int pwmL = map(abs(left), 0, 100, 0, 1023); // ESP8266 tem PWM 10-bit (0-1023)
  int pwmR = map(abs(right), 0, 100, 0, 1023);

  if (left > 5) {
    analogWrite(PIN_D1, pwmL); analogWrite(PIN_D2, 0);
  } else if (left < -5) {
    analogWrite(PIN_D1, 0); analogWrite(PIN_D2, pwmL);
  } else {
    analogWrite(PIN_D1, 0); analogWrite(PIN_D2, 0);
  }

  if (right > 5) {
    analogWrite(PIN_D5, pwmR); analogWrite(PIN_D6, 0);
  } else if (right < -5) {
    analogWrite(PIN_D5, 0); analogWrite(PIN_D6, pwmR);
  } else {
    analogWrite(PIN_D5, 0); analogWrite(PIN_D6, 0);
  }
}

void stopAll() {
  analogWrite(PIN_D1, 0); analogWrite(PIN_D2, 0);
  analogWrite(PIN_D5, 0); analogWrite(PIN_D6, 0);
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_D1, OUTPUT); pinMode(PIN_D2, OUTPUT);
  pinMode(PIN_D5, OUTPUT); pinMode(PIN_D6, OUTPUT);
  stopAll();

  // Inicia Access Point próprio
  WiFi.softAP(ssid, password);
  Serial.print("\nESP8266 AP iniciado! IP: ");
  Serial.println(WiFi.softAPIP()); // 192.168.4.1

  udp.begin(localPort);
  Serial.printf("UDP pronto na porta %d\n", localPort);
}

void loop() {
  int packetSize = udp.parsePacket();
  if (packetSize) {
    int len = udp.read(packetBuffer, 254);
    if (len > 0) packetBuffer[len] = '\0';
    lastTime = millis();

    char cmd[16];
    int x = 0, y = 0;
    sscanf(packetBuffer, "%[^,:]%*[,:]%d%*[,:]%d", cmd, &x, &y);

    if (strcmp(cmd, "DRIVE") == 0) {
      int left = constrain(y + x, -100, 100);
      int right = constrain(y - x, -100, 100);
      setMotors(left, right);
    } else if (strcmp(cmd, "STOP") == 0) {
      stopAll();
    }
  }

  // Watchdog
  if (millis() - lastTime > TIMEOUT_MS) {
    stopAll();
  }
}
