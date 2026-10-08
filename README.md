# 🎮 OmniRC Remote - Controle Remoto Universal para Android

Aplicativo Android completo, nativo, compilado e instalável para controle remoto de projetos de robótica, veículos de rádio controle (RC), carrinhos, drones, esteiras, braços mecânicos e sistemas com **ESP32**, **Arduino**, **Raspberry Pi**, **Pico W** e **micro:bit**, com comunicação em tempo real via **Wi-Fi** (UDP/TCP/HTTP) e **Bluetooth** (Classic SPP e BLE).

---

## 📦 APK Compilado e Pronto para Uso

O aplicativo já está gerado, otimizado e assinado:
- **Arquivo:** `OmniRC-Remote.apk`
- **Caminho absoluto:** `C:\Users\Bryan\.gemini\antigravity\scratch\OmniRC\OmniRC-Remote.apk`
- **Tamanho:** ~78 KB (ultra leve, sem dependências externas pesadas)
- **Assinatura:** APK Signature Scheme v1, v2 e v3 (compatível do Android 5.0 Lollipop até o Android 14+)

---

## 🚀 Como Instalar no Celular

### Opção 1: Via Servidor Wi-Fi Local (Recomendado)
1. No seu computador, abra o PowerShell e inicie o servidor de download rápido:
   ```powershell
   python C:\Users\Bryan\.gemini\antigravity\scratch\OmniRC\serve.py
   ```
2. No celular conectado na mesma rede Wi-Fi, abra o navegador e acesse o endereço mostrado no terminal (ex: `http://192.168.x.x:8080/OmniRC-Remote.apk`).
3. Baixe e instale o APK (autorize "Instalar apps de fontes desconhecidas" caso o Android solicite).

### Opção 2: Transferência Direta (USB / WhatsApp / Drive)
1. Copie o arquivo `OmniRC-Remote.apk` para o celular via cabo USB, Google Drive ou WhatsApp Web.
2. Abra o arquivo no gerenciador de arquivos do celular e toque em **Instalar**.

---

## 🧪 Ambiente de Testes e Simulação no Windows

O projeto acompanha ferramentas para simular e testar o funcionamento completo sem precisar de um microcontrolador físico:

### 1. Servidor Simulador com Painel Web Completo (`rc_device_server.py`)
Inicia um servidor que escuta simultaneamente em **UDP (porta 8888)** e **TCP (porta 8888)** e abre um painel de visualização interativo no navegador:
```powershell
python C:\Users\Bryan\.gemini\antigravity\scratch\OmniRC\rc_device_server.py
```
* **Dashboard visual:** Acessível em `http://localhost:5500`.
* **Simulação de Veículo:** Exibe velocímetro, volante com ângulo real, medidores de motores, faróis, buzina e turbo.
* **Simulação de Braço Robótico:** Mostra os ângulos em tempo real de 4 servos (Base S1, Ombro S2, Cotovelo S3, Garra S4).
* **Terminal de Telemetria:** Log de pacotes com timestamps, taxas de transmissão e IP/porta do cliente conectado.

### 2. Simulador Web no Navegador (`simulate.py`)
Permite rodar a interface completa do OmniRC diretamente no navegador do Windows, com mock da API nativa do Android:
```powershell
python C:\Users\Bryan\.gemini\antigravity\scratch\OmniRC\simulate.py
```

### 3. Receptor Mock de Terminal (`mock_receiver.py`)
Receptor UDP leve que imprime todos os comandos recebidos no terminal para conferência rápida de sintaxe de protocolo:
```powershell
python C:\Users\Bryan\.gemini\antigravity\scratch\OmniRC\mock_receiver.py
```

### 4. Depuração Remota via USB (Chrome DevTools)
1. Conecte o celular com a **Depuração USB** ativada.
2. Abra o Google Chrome no PC e acesse: `chrome://inspect/#devices`.
3. Localize o **OmniRC** e clique em **Inspect** para abrir o console completo (logs, inspeção de DOM, network e breakpoints).

---

## 🌟 Todos os Recursos do Aplicativo

### 🎨 1. Construtor de Layout Personalizado (100% Customizável)
No menu superior de layouts, selecione **🎨 Layout Personalizado**. Você pode montar um painel sob medida para qualquer tipo de projeto:

* **🕹️ Adicionar Joysticks / Analógicos:**
  - Configuração de eixos: **Ambos (X e Y - 360°)**, **Somente Y (Vertical / Acelerador)** ou **Somente X (Horizontal / Direção)**.
  - Opção de retorno ao centro: **Com mola (auto-retorno)** ou **Posição fixa (mantém o valor onde soltou)**.
  - Telemetria de eixos em tempo real (`X:0 Y:0`).
  - Streaming contínuo e sincronizado com a taxa de transmissão do protocolo (`txRateMs`).
  - Comando e rótulo personalizáveis (ex: `JOY1`, `CAM_TILT`, `GIMBAL`).

* **🎚️ Adicionar Sliders / Servos / PWM:**
  - Definição de limites: valor mínimo, máximo e valor inicial customizáveis.
  - Telemetria numérica do valor atual.
  - Envio instantâneo ao deslizar com o comando do protocolo configurado (ex: `SPEED`, `SRV1`, `PWM_MOTOR`).

* **🔘 Adicionar Botões de Ação:**
  - Comportamento: modo **Momentâneo** (ativo apenas enquanto segura) ou modo **Alternar / Toggle** (liga/desliga com visual iluminado).
  - Comando enviado ao pressionar (`val: 1`) e comando opcional ao soltar (`val: 0` ou customizado como `OFF`).
  - Cores de destaque: Ciano Neon, Verde Elétrico, Âmbar, Vermelho Laser e Roxo Neon.
  - Efeitos sonoros (sintetizador Web Audio) e vibração tátil nativa.

* **📐 Adicionar Espaçadores e Divisores de Seção (Paddings):**
  - Criação de divisores estéticos com títulos de seção (ex: "Controles Principais", "Acessórios", "Câmera").
  - Alturas configuráveis (Pequeno 12px, Médio 24px, Grande 40px).

* **📐 Controle de Largura no Grid:**
  - **50% (Meia largura):** posiciona 2 elementos lado a lado na mesma linha.
  - **100% (Largura inteira):** ocupa a linha toda da tela.

* **✏️ Gerenciador Completo de Elementos:**
  - Ferramenta para editar nomes, comandos, eixos e limites de qualquer elemento existente.
  - Botões para reordenar a posição na tela: subir (⬆️) e descer (⬇️).
  - Remoção direta de elementos (🗑️).
  - Persistência automática no armazenamento local do Android.

---

### 🕹️ 2. Layouts Pré-configurados Especializados

1. **🏎️ Carro RC / Rover:**
   - Analógico vertical (Y) para acelerador e freio/marcha à ré.
   - Analógico horizontal (X) para direção do volante.
   - Limitador de potência integrado (slider de 10% a 100%).
   - Botões táteis de acesso rápido: Farol (Toggle), Buzina (Momentâneo), Turbo (Hold) e Marchas.

2. **🛡️ Tanque / Esteiras (Tração Diferencial):**
   - Dois analógicos verticais independentes: Esteira Esquerda e Esteira Direita.
   - Botões dedicados para giro 360° rápido no próprio eixo e ativação de acessórios.

3. **🎮 Gamepad Console:**
   - Dois analógicos completos de 360° (Esquerdo e Direito).
   - Botões de ação estilo console (A, B, X, Y) e botões superiores L1/R1.

4. **🦾 Braço Robótico / Servomotores:**
   - 4 Sliders analógicos para articulações: Base Giratória (S1), Ombro (S2), Cotovelo (S3) e Garra/Gripper (S4).
   - Botões de poses salvas automáticas: Posição Inicial (Home), Pegar Objeto (Pick) e Soltar (Drop).

5. **📟 Terminal Serial & Monitor:**
   - Envio de comandos manuais de texto ou caracteres de controle.
   - Terminal de recepção com rolagem e histórico das últimas 100 mensagens recebidas do microcontrolador.
   - Barra de comandos rápidos configuráveis (`PING`, `STATUS`, `STOP`, `VERSION`, `RESET`, `HELP`).

---

### 📡 3. Protocolos de Comunicação e Modos de Conexão

Pelo botão **📡 Conexão**, selecione a interface física de rede desejada:
* **Wi-Fi UDP:** Envio com latência ultra-baixa de datagramas em tempo real. Suporta conexões ponto a ponto (Unicast) e modo Broadcast geral (`255.255.255.255`).
* **Wi-Fi TCP Socket:** Conexão socket orientada a fluxo contínuo e persistente.
* **Wi-Fi HTTP:** Envio de parâmetros via requisições REST/Web Server embarcado.
* **Bluetooth Classic (SPP / RFCOMM):**
  - Compatível com **HC-05**, **HC-06**, **ESP32 Bluetooth Classic** (UUID `00001101-0000-1000-8000-00805F9B34FB`).
  - Lista de dispositivos pareados no Android com reconexão em 1 toque.
  - Scanner de dispositivos próximos integrado.
* **Bluetooth Low Energy (BLE):**
  - Compatível com **ESP32 BLE**, **HM-10**, **micro:bit**, **Arduino Nano 33 BLE** via Nordic UART Service (`6E400001-...`).
  - Scanner BLE em tempo real com leitura de sinal RSSI (dBm).

---

### ⚙️ 4. Motor de Protocolo e Formatação de Dados

Pelo menu **⚙️ Protocolo**, personalize o padrão de mensagens para casar exatamente com o código do seu receptor:

| Formato | Exemplo de Saída | Aplicação Típica |
| :--- | :--- | :--- |
| **Delimitado por dois-pontos** | `DRIVE:0:85\n` | ESP32 / Arduino com `sscanf` ou `strtok` |
| **CSV (Delimitado por vírgula)**| `DRIVE,0,85\n` | Padrão clássico de telemetria |
| **Texto Simples / ASCII** | `F\n`, `B\n`, `L\n`, `R\n`, `S\n` | Carrinhos básicos de 1 caractere |
| **JSON Estruturado** | `{"cmd":"DRIVE","x":0,"y":85}` | ESP32 com biblioteca `ArduinoJson` |
| **Hexadecimal / Bytes Binários**| `AA 01 00 55 55` | Protocolos industriais ou rádio RF |
| **Template Customizado** | `RC:{cmd}:{x}:{y}\n` ou `M:{left}:{right}\n` | Qualquer formato customizado pelo usuário |

* **Faixa de Valores dos Canais:**
  - Porcentagem: `-100` a `+100`
  - Byte Sem Sinal: `0` a `255` (com centro em `128`)
  - Inteiro com Sinal: `-127` a `+127`
* **Taxa de Transmissão (Taxa de loop TX):**
  - 20 ms (50 Hz - Resposta ultra rápida para corrida)
  - 50 ms (20 Hz - Padrão equilibrado)
  - 100 ms (10 Hz - Econômico para robôs lentos)
* **Zona Morta do Analógico (Deadzone):** configurável de 0% a 20% para evitar oscilações no repouso do joystick.
* **Cálculo Matemático de Tração Diferencial:** o app calcula matematicamente as velocidades individuais para motores esquerdo e direito a partir dos eixos X e Y.
* **🛑 Botão de Parada de Emergência (Emergency Stop):** botão físico na barra superior que zera instantaneamente todos os motores, centraliza analógicos e transmite pacote de corte (`STOP` / `S\n`).
* **Feedback Multissensorial:** sintetizador sonoro Web Audio API com tons variáveis e resposta tátil háptica no aparelho.

---

## 🛠️ Como Recompilar o APK

O pipeline completo de compilação automatizada local está pronto e não requer instalação do Android Studio:
```powershell
python C:\Users\Bryan\.gemini\antigravity\scratch\OmniRC\build.py
```
O script executa em ~1 segundo:
1. Compilação dos recursos com **AAPT2**
2. Vinculação com o `android.jar` (API 34)
3. Compilação das classes Java com **javac**
4. Conversão para bytecode Dalvik DEX com **D8**
5. Alinhamento e assinatura v1/v2/v3 com **Uber-APK-Signer**

---

## 💻 Exemplos de Código Embarcado para Receptores

### Exemplo 1: ESP32 com Wi-Fi UDP (Arduino IDE / PlatformIO)
```cpp
#include <WiFi.h>
#include <WiFiUdp.h>

const char* ssid = "NOME_DO_SEU_WIFI";
const char* password = "SENHA_DO_SEU_WIFI";
WiFiUDP udp;
char packetBuffer[255];

void setup() {
  Serial.begin(115200);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(300);
    Serial.print(".");
  }
  Serial.print("\nConectado! IP do Carrinho: ");
  Serial.println(WiFi.localIP()); // Coloque este IP na aba Conexão do OmniRC
  udp.begin(8888); // Porta padrão do OmniRC
}

void loop() {
  int packetSize = udp.parsePacket();
  if (packetSize) {
    int len = udp.read(packetBuffer, 255);
    if (len > 0) packetBuffer[len] = '\0';
    Serial.printf("Comando recebido: %s", packetBuffer);

    // Exemplo: processar comando DRIVE:X:Y
    char cmd[16];
    int x = 0, y = 0;
    if (sscanf(packetBuffer, "%[^:]:%d:%d", cmd, &x, &y) >= 1) {
      if (strcmp(cmd, "DRIVE") == 0) {
        // x = direção (-100 a +100), y = acelerador (-100 a +100)
      } else if (strcmp(cmd, "STOP") == 0) {
        // Desligar motores
      }
    }
  }
}
```

### Exemplo 2: ESP32 com Bluetooth Classic SPP
```cpp
#include "BluetoothSerial.h"

BluetoothSerial SerialBT;

void setup() {
  Serial.begin(115200);
  SerialBT.begin("OmniRC_Car"); // Nome visível no pareamento do Android
  Serial.println("Bluetooth iniciado! Pareie com 'OmniRC_Car' no celular.");
}

void loop() {
  if (SerialBT.available()) {
    String msg = SerialBT.readStringUntil('\n');
    Serial.println("Recebido: " + msg);
  }
}
```
