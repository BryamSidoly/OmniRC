/**
 * OmniRC - Exemplo ESP32 Wi-Fi UDP com Ponte H e Watchdog de Segurança (Fail-Safe)
 * 
 * Protocolo no OmniRC: Delimitado (:) ou CSV (,), Faixa PERCENT (-100 a +100)
 * Porta padrão: 8888 (UDP)
 */

#include <WiFi.h>
#include <WiFiUdp.h>

// Configurações de Wi-Fi (Modo Ponto de Acesso ou Estação)
#define WIFI_MODE_AP true // Se true, o ESP32 cria sua própria rede Wi-Fi!

const char* ssid = "OmniRC_Car_ESP32";
const char* password = "adminpassword";

// Porta UDP
const unsigned int localPort = 8888;
WiFiUDP udp;
char packetBuffer[255];

// Pinos da Ponte H (ex: L298N ou TB6612FNG)
const int PIN_IN1 = 26; // Motor Esquerdo Frente
const int PIN_IN2 = 27; // Motor Esquerdo Ré
const int PIN_IN3 = 14; // Motor Direito Frente
const int PIN_IN4 = 12; // Motor Direito Ré
const int PIN_FAROL = 2; // LED do Farol embutido

// Configuração PWM no ESP32
const int PWM_FREQ = 1000;
const int PWM_RES = 8; // 0-255

// Watchdog de Segurança (Fail-Safe)
unsigned long lastPacketTime = 0;
const unsigned long TIMEOUT_MS = 600; // Desliga motores após 600ms sem comando

void setMotors(int leftSpeed, int rightSpeed) {
  // Motor Esquerdo (-100 a +100)
  int pwmLeft = map(abs(leftSpeed), 0, 100, 0, 255);
  if (leftSpeed > 5) {
    ledcWrite(0, pwmLeft); ledcWrite(1, 0);
  } else if (leftSpeed < -5) {
    ledcWrite(0, 0); ledcWrite(1, pwmLeft);
  } else {
    ledcWrite(0, 0); ledcWrite(1, 0);
  }

  // Motor Direito (-100 a +100)
  int pwmRight = map(abs(rightSpeed), 0, 100, 0, 255);
  if (rightSpeed > 5) {
    ledcWrite(2, pwmRight); ledcWrite(3, 0);
  } else if (rightSpeed < -5) {
    ledcWrite(2, 0); ledcWrite(3, pwmRight);
  } else {
    ledcWrite(2, 0); ledcWrite(3, 0);
  }
}

void stopAll() {
  ledcWrite(0, 0);
  ledcWrite(1, 0);
  ledcWrite(2, 0);
  ledcWrite(3, 0);
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_FAROL, OUTPUT);

  // Configuração dos canais PWM
  ledcSetup(0, PWM_FREQ, PWM_RES); ledcAttachPin(PIN_IN1, 0);
  ledcSetup(1, PWM_FREQ, PWM_RES); ledcAttachPin(PIN_IN2, 1);
  ledcSetup(2, PWM_FREQ, PWM_RES); ledcAttachPin(PIN_IN3, 2);
  ledcSetup(3, PWM_FREQ, PWM_RES); ledcAttachPin(PIN_IN4, 3);
  stopAll();

  // Inicialização Wi-Fi
  if (WIFI_MODE_AP) {
    WiFi.softAP(ssid, password);
    Serial.println("\n[Wi-Fi] Ponto de Acesso Criado!");
    Serial.print("SSID: "); Serial.println(ssid);
    Serial.print("IP do Carrinho: "); Serial.println(WiFi.softAPIP()); // Padrão: 192.168.4.1
  } else {
    WiFi.begin(ssid, password);
    while (WiFi.status() != WL_CONNECTED) { delay(300); Serial.print("."); }
    Serial.print("\n[Wi-Fi] Conectado! IP: "); Serial.println(WiFi.localIP());
  }

  udp.begin(localPort);
  Serial.printf("[UDP] Ouvindo na porta %d\n", localPort);
}

void loop() {
  int packetSize = udp.parsePacket();
  if (packetSize) {
    int len = udp.read(packetBuffer, 254);
    if (len > 0) packetBuffer[len] = '\0';
    lastPacketTime = millis(); // Reset do Watchdog

    // Processar comandos
    char cmd[20];
    int x = 0, y = 0, val = 0;
    
    // Tenta formato: CMD:X:Y ou CMD:X:Y:VAL
    int parsed = sscanf(packetBuffer, "%[^,:]%*[,:]%d%*[,:]%d%*[,:]%d", cmd, &x, &y, &val);
    
    if (parsed >= 3 && strcmp(cmd, "DRIVE") == 0) {
      // x = direção (-100 a +100), y = acelerador (-100 a +100)
      // Mistura diferencial no microcontrolador (ou use o modo diferencial nativo do app)
      int left = constrain(y + x, -100, 100);
      int right = constrain(y - x, -100, 100);
      setMotors(left, right);
    } else if (strcmp(cmd, "TANK") == 0 && parsed >= 3) {
      // y = esquerda, x = direita
      setMotors(y, x);
    } else if (strcmp(cmd, "LIGHT") == 0) {
      digitalWrite(PIN_FAROL, val ? HIGH : LOW);
    } else if (strcmp(cmd, "STOP") == 0 || strcmp(packetBuffer, "S\n") == 0) {
      stopAll();
    }
  }

  // Fail-Safe: Desliga motores se o sinal Wi-Fi for perdido
  if (millis() - lastPacketTime > TIMEOUT_MS) {
    stopAll();
  }
}
