/**
 * OmniRC - Exemplo ESP32-CAM: Vídeo Streaming FPV + Controle RC UDP Simultâneo
 * 
 * Este código roda na placa ESP32-CAM (módulo AI-Thinker / OV2640).
 * 1. Servidor de Vídeo HTTP na porta 81 com stream MJPEG contínuo (URL: http://IP:81/stream)
 * 2. Receptor UDP de Controle Remoto na porta 8888 (comandos do OmniRC)
 * 
 * No app OmniRC:
 * - Em "📹 Câmera", selecione "ESP32-CAM" e coloque a URL: http://IP_DO_ESP32:81/stream
 * - Em "📡 Conexão", selecione Wi-Fi UDP no mesmo IP e porta 8888!
 */

#include "esp_camera.h"
#include <WiFi.h>
#include <WiFiUdp.h>
#include "esp_http_server.h"

// Seleção do Modelo de Placa ESP32-CAM (Pinos padrão AI-THINKER)
#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27
#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22

// Pinos de controle de motores (ou servos de pan/tilt da câmera)
#define PIN_MOTOR_A       12
#define PIN_MOTOR_B       13
#define PIN_FLASH_LED      4 // LED flash de alta potência embutido

const char* ssid = "OmniRC_Cam_Car";
const char* password = "adminpassword";

// Portas de rede
const unsigned int udpPort = 8888;
WiFiUDP udp;
char packetBuffer[255];
httpd_handle_t stream_httpd = NULL;

#define PART_BOUNDARY "123456789000000000000987654321"
static const char* _STREAM_CONTENT_TYPE = "multipart/x-mixed-replace;boundary=" PART_BOUNDARY;
static const char* _STREAM_BOUNDARY = "\r\n--" PART_BOUNDARY "\r\n";
static const char* _STREAM_PART = "Content-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n";

static esp_err_t stream_handler(httpd_req_t *req) {
  camera_fb_t * fb = NULL;
  esp_err_t res = ESP_OK;
  size_t _jpg_buf_len = 0;
  uint8_t * _jpg_buf = NULL;
  char * part_buf[64];

  res = httpd_resp_set_type(req, _STREAM_CONTENT_TYPE);
  if (res != ESP_OK) return res;

  while (true) {
    fb = esp_camera_fb_get();
    if (!fb) {
      Serial.println("[CAM] Falha ao capturar frame");
      res = ESP_FAIL;
    } else {
      _jpg_buf_len = fb->len;
      _jpg_buf = fb->buf;
    }
    if (res == ESP_OK) {
      size_t hlen = snprintf((char *)part_buf, 64, _STREAM_PART, _jpg_buf_len);
      res = httpd_resp_send_chunk(req, (const char *)part_buf, hlen);
    }
    if (res == ESP_OK) {
      res = httpd_resp_send_chunk(req, (const char *)_jpg_buf, _jpg_buf_len);
    }
    if (res == ESP_OK) {
      res = httpd_resp_send_chunk(req, _STREAM_BOUNDARY, strlen(_STREAM_BOUNDARY));
    }
    if (fb) {
      esp_camera_fb_return(fb);
      fb = NULL;
      _jpg_buf = NULL;
    } else if (res != ESP_OK) {
      break;
    }
  }
  return res;
}

void startCameraServer() {
  httpd_config_t config = HTTPD_DEFAULT_CONFIG();
  config.server_port = 81;
  config.ctrl_port = 32768;

  httpd_uri_t stream_uri = {
    .uri       = "/stream",
    .method    = HTTP_GET,
    .handler   = stream_handler,
    .user_ctx  = NULL
  };

  if (httpd_start(&stream_httpd, &config) == ESP_OK) {
    httpd_register_uri_handler(stream_httpd, &stream_uri);
    Serial.println("[HTTP] Servidor de Câmera FPV iniciado na porta 81 (/stream)");
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_FLASH_LED, OUTPUT);
  digitalWrite(PIN_FLASH_LED, LOW);

  // Configuração da Câmera OV2640
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sscb_sda = SIOD_GPIO_NUM;
  config.pin_sscb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;

  if (psramFound()) {
    config.frame_size = FRAMESIZE_VGA; // 640x480
    config.jpeg_quality = 12;
    config.fb_count = 2;
  } else {
    config.frame_size = FRAMESIZE_QVGA; // 320x240
    config.jpeg_quality = 15;
    config.fb_count = 1;
  }

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("[CAM] Falha ao iniciar câmera OV2640 (0x%x)\n", err);
    return;
  }

  // Cria Access Point Wi-Fi do Carrinho com Câmera
  WiFi.softAP(ssid, password);
  IPAddress ip = WiFi.softAPIP(); // Padrão: 192.168.4.1
  Serial.println("\n[Wi-Fi] Access Point criado!");
  Serial.print("Stream URL para o OmniRC: http://");
  Serial.print(ip);
  Serial.println(":81/stream");

  startCameraServer();
  udp.begin(udpPort);
  Serial.printf("[UDP] Ouvindo comandos RC na porta %d\n", udpPort);
}

void loop() {
  int packetSize = udp.parsePacket();
  if (packetSize) {
    int len = udp.read(packetBuffer, 254);
    if (len > 0) packetBuffer[len] = '\0';

    char cmd[16];
    int x = 0, y = 0, val = 0;
    sscanf(packetBuffer, "%[^,:]%*[,:]%d%*[,:]%d%*[,:]%d", cmd, &x, &y, &val);

    if (strcmp(cmd, "DRIVE") == 0) {
      Serial.printf("[RC DRIVE] Dir: %d | Acel: %d\n", x, y);
      // Controle de motores aqui...
    } else if (strcmp(cmd, "LIGHT") == 0) {
      digitalWrite(PIN_FLASH_LED, val ? HIGH : LOW);
    } else if (strcmp(cmd, "STOP") == 0) {
      // Parar motores...
    }
  }
}
