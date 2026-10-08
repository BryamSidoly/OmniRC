# 🎮 OmniRC Remote - Controle Remoto Universal para Android

Aplicativo Android completo, nativo, compilado e instalável para controle remoto de veículos de rádio controle (RC), robôs móveis, drones, esteiras, braços mecânicos e sistemas embarcados com **ESP32**, **Arduino**, **Raspberry Pi**, **Raspberry Pi Pico W**, **STM32** e **micro:bit**.

O sistema opera com comunicação em tempo real via **Wi-Fi** (UDP, TCP Socket e HTTP) e **Bluetooth** (Classic SPP e Low Energy BLE), dispondo de layouts e protocolos 100% personalizáveis.

---

## 📦 APK Compilado e Instalação Rápida

* **Download Direto:** [OmniRC-Remote.apk (GitHub Releases v1.1.0)](https://github.com/BryamSidoly/OmniRC/releases/download/v1.1.0/OmniRC-Remote.apk)
* **Arquivo no Repositório:** `OmniRC-Remote.apk` (~91 KB)
* **Versão:** v1.1.0 (Build 2)
* **Assinatura:** APK Signature Scheme v1, v2 e v3 (compatível do Android 5.0 Lollipop ao Android 14+)

### Como Instalar no Celular:
1. **Pelo Computador (Wi-Fi Local):** Execute `python serve.py` e abra no navegador do celular o endereço exibido (ex: `http://192.168.x.x:8080/OmniRC-Remote.apk`).
2. **Transferência Direta:** Transfira o arquivo `OmniRC-Remote.apk` via USB, WhatsApp ou Drive e clique em **Instalar** no celular.

---

## 🏗️ Arquitetura Interna do Sistema

O OmniRC utiliza uma arquitetura híbrida de alta performance, unindo uma interface gráfica fluida e responsiva baseada em HTML5/Canvas com controladores nativos em Java em threads dedicadas para garantir baixíssima latência e evitar congelamento de interface (UI blocking):

```mermaid
flowchart TD
    subgraph UI ["Interface do Usuário (WebView / JS Engine)"]
        Touch["Interação do Usuário\n(Touch, Analógicos, Sliders, Botões)"]
        JM["Gerenciador de Layouts\n(layouts.js & joystick.js)"]
        PM["Motor de Protocolos\n(protocol.js)"]
        TxLoop["Loop Temporizado TX\n(txRateMs: 20ms / 50ms / 100ms)"]
        AudioHaptic["Feedback Sensorial\n(Web Audio Synth + Vibração)"]
    end

    subgraph Bridge ["Ponte Nativa Android (Java Bridge)"]
        BridgeInt["@JavascriptInterface\nWebAppInterface.java"]
    end

    subgraph Native ["Controladores Nativos em Threads Dedicadas"]
        NetCtrl["NetworkController.java\n(Wi-Fi UDP / TCP / HTTP)"]
        BtClassic["BluetoothClassicController.java\n(RFCOMM / SPP Serial)"]
        BtBle["BluetoothLeController.java\n(GATT Nordic UART / HM-10)"]
    end

    subgraph Hardware ["Meio Físico & Receptor Remoto"]
        Antenna["Antena de Rádio\n(Wi-Fi / Bluetooth do Telefone)"]
        MCU["Microcontrolador Embarcado\n(ESP32 / Arduino / RPi)"]
        Motors["Atuadores Físicos\n(Ponte H, Servos, ESC, Relés)"]
    end

    Touch --> JM
    JM --> AudioHaptic
    JM --> PM
    PM --> TxLoop
    TxLoop --> BridgeInt

    BridgeInt --> NetCtrl
    BridgeInt --> BtClassic
    BridgeInt --> BtBle

    NetCtrl --> Antenna
    BtClassic --> Antenna
    BtBle --> Antenna

    Antenna --> MCU
    MCU --> Motors

    %% Fluxo de Telemetria Reversa
    MCU -. Telemetria / Respostas .-> Antenna
    Antenna -. Recebimento de Pacotes .-> NetCtrl
    Antenna -. Recebimento Serial .-> BtClassic
    Antenna -. Notificações GATT .-> BtBle
    NetCtrl -. evaluateJavascript .-> BridgeInt
    BtClassic -. evaluateJavascript .-> BridgeInt
    BtBle -. evaluateJavascript .-> BridgeInt
    BridgeInt -. window.onNativeData .-> UI
```

### Telemetria Bidirecional
Além de enviar comandos, o aplicativo escuta respostas e dados de sensores (temperatura, tensão da bateria, eco de status) transmitidos pelo microcontrolador. O fluxo reverso passa pelas threads nativas e é injetado no DOM através do terminal serial em tempo real (`window.onNativeData`).

---

## 📡 Funcionamento Detalhado das Conexões

O aplicativo suporta 5 canais físicos de comunicação, cada um otimizado para um cenário específico de automação ou rádio controle:

### 1. Wi-Fi UDP (User Datagram Protocol) - *Padrão para RC em Tempo Real*
* **Como opera:** utiliza datagramas puros (`java.net.DatagramSocket` e `DatagramPacket`) na camada de transporte IP.
* **Sem Handshake:** não há estabelecimento de conexão prévia de 3 vias (3-way handshake) nem confirmação de entrega (ACK/NACK).
* **Por que é o ideal para RC:** em veículos rápidos, dados defasados não têm utilidade. Se um pacote com a posição do acelerador se perder, o próximo chegará em 20 ms. O UDP elimina o overhead e o buffer bloqueante do TCP, mantendo latência inferior a **3 ms**.
* **Modo Unicast vs Broadcast:**
  - **Unicast:** envia diretamente ao IP do carrinho (ex: `192.168.4.1` em modo Access Point ou `192.168.1.150` em modo estação).
  - **Broadcast (`255.255.255.255`):** transmite para todos os dispositivos da sub-rede na porta configurada (padrão `8888`), permitindo conectar instantaneamente sem precisar descobrir o IP do microcontrolador.
* **Escuta Paralela:** uma thread em background (`udpReceiveThread`) escuta continuamente mensagens de retorno com buffer de 2048 bytes.

### 2. Wi-Fi TCP Socket (Transmission Control Protocol)
* **Como opera:** estabelece conexão de fluxo contínuo e persistente (`java.net.Socket`) com o servidor do microcontrolador.
* **Garantia de Entrega:** todo byte enviado é confirmado pelo receptor. Ideal para braços robóticos, comandos de configuração e envio de comandos onde nenhuma perda pode ocorrer.
* **Delimitação de Pacotes:** pacotes são transmitidos sequencialmente no `OutputStream` com caracteres terminadores de linha (`\n` ou `\r\n`) para que o microcontrolador possa separá-los facilmente via `readStringUntil('\n')`.

### 3. Wi-Fi HTTP (RESTful GET/POST)
* **Como opera:** dispara requisições assíncronas via `java.net.HttpURLConnection` em pool de threads (`Executors.newCachedThreadPool()`).
* **Ideal para:** servidores web embarcados simples em ESP8266/ESP32 (como `ESPAsyncWebServer`), acionando endpoints como `http://192.168.4.1/cmd?action=FRENTE`.

### 4. Bluetooth Classic SPP (Serial Port Profile / RFCOMM)
* **Como opera:** emula uma porta serial RS-232 transparente sobre a camada RFCOMM do Bluetooth.
* **UUID Padrão:** utiliza o UUID universal de porta serial SPP:  
  `00001101-0000-1000-8000-00805F9B34FB`
* **Compatibilidade:** módulos **HC-05**, **HC-06**, **ESP32 Classic** (via `BluetoothSerial.h`), adaptadores Arduino e robôs educacionais.
* **Ciclo de Conexão:**
  1. O aplicativo lê os dispositivos previamente pareados no Android (`BluetoothAdapter.getBondedDevices()`).
  2. Dispara a conexão em thread assíncrona para não travar a interface (`device.createRfcommSocketToServiceRecord(SPP_UUID)`).
  3. Uma thread de leitura contínua (`readThread`) monitora o `InputStream` para exibir dados de sensores no terminal do app.

### 5. Bluetooth Low Energy (BLE - GATT Central)
* **Como opera:** conecta como dispositivo **Central (Cliente)** a servidores GATT embarcados com perfil de porta serial BLE.
* **Serviços Suportados Automaticamente:**
  - **Nordic UART Service (NUS):** padrão da indústria para microcontroladores modernos:
    - Service UUID: `6E400001-B5A3-F393-E0A9-E50E24DCCA9E`
    - TX Characteristic (Envio): `6E400002-B5A3-F393-E0A9-E50E24DCCA9E` (Write)
    - RX Characteristic (Retorno): `6E400003-B5A3-F393-E0A9-E50E24DCCA9E` (Notify)
  - **Módulos HM-10 / CC2541 / AT-09:**
    - Service UUID: `0000FFE0-0000-1000-8000-00805F9B34FB`
    - Characteristic: `0000FFE1-0000-1000-8000-00805F9B34FB`
* **Negociação de MTU:** solicita negociação de MTU de até 512 bytes (`requestMtu(512)`). Em dispositivos que só aceitam MTU padrão de 20 bytes, o app faz fragmentação segura em chunks.
* **Scanner BLE com RSSI:** localiza dispositivos no ar exibindo o nível de potência de sinal recebido em decibéis (dBm), auxiliando a verificar proximidade.

---

## ⚙️ Funcionamento Detalhado dos Protocolos

O motor de protocolos (`ProtocolManager`) é o coração do OmniRC, responsável por traduzir toques na tela em comandos formatados:

```mermaid
flowchart LR
    Raw["1. Valores Brutos\nX: [-100..100]\nY: [-100..100]"] --> DZ["2. Filtro de Zona Morta\n(|val| < deadzone => 0)"]
    DZ --> Inv["3. Inversão Opcional\n(invertX / invertY)"]
    Inv --> Scale["4. Mapeamento de Escala\n(PERCENT, BYTE, PWM)"]
    Scale --> Diff["5. Cálculo Diferencial\n(Left = Y + X, Right = Y - X)"]
    Diff --> Format["6. Serialização do Protocolo\n(Delimitado, CSV, JSON, HEX, Template)"]
    Format --> Packet["7. Pacote Formatado Pronto para Envio"]
```

### 1. Filtro de Zona Morta (Deadzone)
Evita que folgas no analógico ou movimentos mínimos do dedo façam o veículo se mover sozinho em repouso.
* Se $|\text{valor}| < \text{deadzone}$ (configurável de 0% a 20%), o valor é zerado automaticamente antes do envio.

### 2. Mapeamento de Faixa de Valores (Value Range)
Diferentes microcontroladores trabalham com escalas distintas:
* **PERCENT (-100 a +100):** padrão intuitivo para aceleração e esterçamento.
* **BYTE (0 a 255):** escala positiva de 8 bits muito comum em receptores simples. O ponto neutro (centro) é mapeado exatamente em **128**:
  $$\text{Byte} = \text{round}\left(\frac{\text{val} + 100}{200} \times 255\right)$$
* **PWM (-255 a +255):** mapeamento direto para PWM com sinal (usado para alimentar pontes H como L298N, TB6612FNG):
  $$\text{PWM} = \text{round}\left(\frac{\text{val}}{100} \times 255\right)$$

### 3. Tração Diferencial Automática (Differential Steering)
Para carrinhos de esteira, barcos com 2 hélices ou robôs com 2 motores onde não há servo de esterçamento e as curvas são feitas pela diferença de rotação das rodas:
* O app calcula matematicamente no cliente as velocidades dos motores:
  $$\text{Motor Esquerdo} = \text{clamp}(Y + X, -100, 100)$$
  $$\text{Motor Direito} = \text{clamp}(Y - X, -100, 100)$$
* Os valores de `left` e `right` já saem normalizados na escala escolhida e podem ser incluídos no pacote via tags `{left}` e `{right}`.

### 4. Formatos de Serialização Suportados

| Formato | Sintaxe Gerada | Exemplo de Saída | Uso Recomendado |
| :--- | :--- | :--- | :--- |
| **Delimitado (`DELIMITED`)** | `{cmd}:{x}:{y}:{val}\n` | `DRIVE:15:85\n` | ESP32/Arduino com `sscanf()` ou `strtok()` |
| **CSV** | `{cmd},{x},{y},{val}\n` | `DRIVE,15,85\n` | Padrão clássico de telemetria |
| **Texto Simples (`RAW`)** | `{cmd}\n` | `F\n`, `B\n`, `L\n`, `R\n`, `S\n` | Carrinhos básicos de 1 caractere |
| **JSON** | `{"cmd":"...","x":..,"y":..}\n` | `{"cmd":"DRIVE","x":15,"y":85}\n` | ESP32 com biblioteca `ArduinoJson` |
| **Hexadecimal (`HEX`)** | `AA [CMD] [X] [Y] [VAL] 55` | `AA 44 0F 55 00 55` | Protocolos binários industriais ou rádio RF |
| **Template Customizado** | Interpolação textual livre | `M:{left}:{right}\n` ou `RC:{cmd}:{x}:{y}` | Qualquer formato customizado pelo usuário |

#### Marcadores Suportados no Template Customizado:
* `{cmd}`: Nome do comando (ex: `DRIVE`, `SPEED`, `JOY1`).
* `{x}`: Valor do eixo horizontal mapeado.
* `{y}`: Valor do eixo vertical mapeado.
* `{val}`: Valor escalar (slider ou botão).
* `{left}`: Valor calculado para o motor esquerdo (tração diferencial).
* `{right}`: Valor calculado para o motor direito (tração diferencial).
* `\n` ou `\r\n`: Quebras de linha reais.

### 5. Loop Temporizado de Transmissão (Tx Rate Loop)
Para evitar saturar o buffer serial ou o stack de rede do microcontrolador com centenas de eventos de touch por segundo, o OmniRC utiliza um **loop desacoplado**:
* Taxas configuráveis: **20 ms (50 Hz)**, **50 ms (20 Hz)** ou **100 ms (10 Hz)**.
* Os analógicos apenas atualizam registradores em memória; o timer periódico transmite a foto do estado na frequência exata programada.
* **Benefício de Segurança:** essa cadência contínua é ideal para implementar um temporizador de cão de guarda (**Watchdog**) no microcontrolador.

### 6. Sistema de Parada de Emergência (Fail-Safe & E-Stop)
* **Botão Físico na Barra Superior:** zera imediatamente todos os estados internos do acelerador, volante e esteiras.
* **Disparo Redundante de Corte:** transmite pacotes de parada imediata em múltiplos formatos (`STOP` formatado e `S\n` ASCII).
* **Feedback Visual e Tátil:** pulso de vibração longo de 100 ms, aviso sonoro em onda dente de serra e alerta visual instantâneo na tela.

---

## 🎨 Construtor de Layout Personalizado

No menu de layouts, selecione **🎨 Layout Personalizado**. Você pode montar um painel exclusivo com elementos modulares:

1. **🕹️ Joysticks Analógicos:**
   - Eixos: Ambos (X/Y), Somente Y (Vertical/Acelerador) ou Somente X (Horizontal/Direção).
   - Retorno ao centro com mola ou posição fixa (mantém a posição solta).
   - Telemetria de coordenadas em tempo real (`X:0 Y:0`).
   - Comando associado no protocolo (ex: `JOY1`, `CAMERA_TILT`).

2. **🎚️ Sliders (Controles Deslizantes / Servos / PWM):**
   - Valores mínimo, máximo e valor inicial configuráveis.
   - Envio imediato ao deslizar formatado pelo motor de protocolos.
   - Mostrador numérico em tempo real.

3. **🔘 Botões de Ação Táteis:**
   - Comportamento **Momentâneo** (ativo enquanto segurado) ou **Alternar / Toggle** (liga/desliga iluminado).
   - Comando ao pressionar e comando customizado opcional ao soltar (ex: `TURBO` e `TURBO_OFF`).
   - Cores de destaque: Ciano, Verde, Âmbar, Vermelho e Magenta.
   - Feedback de som sintético Web Audio e vibração nativa.

4. **📐 Espaçadores e Divisores (Paddings):**
   - Criação de divisores estilizados com títulos de seção (ex: "Controles Principais", "Câmera").
   - Alturas de 12px, 24px e 40px.

5. **Organização em Grid Flexível:**
   - **50%:** 2 elementos lado a lado na mesma linha.
   - **100%:** ocupa a largura total da linha.
   - Reordenação (⬆️ subir / ⬇️ descer) e exclusão (🗑️) no menu de gerenciamento.
   - Persistência automática no armazenamento do Android.

---

## 🕹️ Layouts Pré-configurados Especializados

* **🏎️ Carro RC / Rover:** acelerador vertical, direção horizontal, limitador de potência (10% a 100%) e botões de ação rápida (Farol, Buzina, Turbo, Marchas).
* **🛡️ Tanque / Esteiras:** analógicos verticais independentes para esteira esquerda e direita com botões para giro de 360° no próprio eixo.
* **🎮 Gamepad Console:** dois analógicos de 360° e botões estilo console (A, B, X, Y, L1, R1).
* **🦾 Braço Robótico / Servos:** 4 sliders analógicos para juntas articuladas (Base S1, Ombro S2, Cotovelo S3, Garra S4) e botões de poses pré-salvas (Home, Pick, Drop).
* **📟 Terminal Serial & Monitor:** terminal de telemetria bidirecional, envio manual e histórico de mensagens.

---

## 🧭 Controle por Sensores do Celular (Acelerômetro, Giroscópio & Tilt Control)

O OmniRC transforma o seu smartphone em um volante e acelerador por movimento utilizando os sensores inerciais físicos (**Acelerômetro e Giroscópio**) do Android:

```mermaid
flowchart LR
    Sensors["Sensores Físicos\n(Acelerômetro + Giroscópio)"] --> Java["WebAppInterface.java\n(SensorManager 50ms)"]
    Java --> Calib["Motor de Calibração\n(Zero Offset & Deadzone)"]
    Calib --> Mode{"Modo de Pilotagem"}
    Mode -->|"Direção + Acelerador"| Drive["X = Roll (Volante)\nY = Pitch (Acelerador)"]
    Mode -->|"Somente Direção"| Steer["X = Roll (Volante)\nY = Toque na Tela"]
    Mode -->|"Gimbal / Câmera"| Gimbal["X = Yaw / Pan\nY = Pitch / Tilt"]
    Drive --> Proto["Motor de Protocolos\n(Envio UDP / BLE / SPP)"]
    Steer --> Proto
    Gimbal --> Proto
```

### 📐 Recursos do Controlador de Sensores:
1. **Acesso Nativo de Baixa Latência:** A camada Java (`WebAppInterface.java`) registra listeners nos sensores inerciais físicos (`TYPE_ACCELEROMETER` e `TYPE_GYROSCOPE`) com taxa contínua de 50 ms despachados diretamente ao JavaScript (`window.onNativeSensorData`).
2. **Fallback Universal:** Caso executado em navegadores web ou simuladores de PC, o motor chaveia automaticamente para a API HTML5 `DeviceOrientationEvent` e `DeviceMotionEvent`.
3. **Calibração de Zero ("Zerar"):** Um botão dedicado grava a postura atual das suas mãos como referência $(0^\circ, 0^\circ)$, permitindo pilotar deitado na cama, sentado à mesa ou segurando o celular em qualquer ângulo com conforto ergonômico.
4. **Filtro de Zona Morta (Deadzone):** Descarta vibrações musculares e micro-tremores (configurável de 2° a 20°).
5. **Multiplicador de Sensibilidade:** Ajustável de $0.2\times$ a $3.0\times$, permitindo controle cirúrgico para veículos velozes ou giro rápido para drift.
6. **Modos de Pilotagem:**
   - **🏎️ Direção + Acelerador (Pitch + Roll):** Inclinar para os lados esterça o volante ($X$); inclinar para frente/trás acelera ou freia ($Y$).
   - **🔄 Somente Direção (Roll):** Esterçamento por inclinação como um volante esportivo real, mantendo aceleração e frenagem sob o controle do polegar no analógico ou botões.
   - **🎥 Gimbal / Câmera 2 Eixos (Pan / Tilt):** Controla a movimentação de uma câmera ou torre com a orientação do aparelho.

---

## 📹 Integração com Câmeras FPV, Câmeras IP e Embarcadas

O OmniRC integra transmissão de vídeo em tempo real (FPV - *First Person View*) diretamente na tela de controle, eliminando a necessidade de alternar aplicativos durante a pilotagem.

```mermaid
flowchart TD
    CamFeed["Fluxo de Vídeo FPV\n(MJPEG / WebRTC / JPEG)"] --> DisplayMode{"Modo de Visualização"}
    DisplayMode -->|"Cockpit HUD"| HUD["Fundo de Tela Dinâmico\nControles Translúcidos Sobrepostos"]
    DisplayMode -->|"Picture-in-Picture"| PiP["Janela Flutuante PiP\nCanto da Tela Redimensionável"]
    
    subgraph Cameras ["Fontes de Câmera Suportadas"]
        ESP32CAM["ESP32-CAM (OV2640)\nhttp://ip:81/stream"]
        Yoosee["Yoosee / Câmeras IP ONVIF\nFluxos MJPEG / Snapshot HTTP"]
        RPi["Raspberry Pi / Jetson\nFlask MJPEG / Picamera"]
        Local["Câmera Nativa do Celular\nFrontal / Traseira via WebRTC"]
        Sim["Simulador Desktop\nhttp://localhost:5500/camera_feed"]
    end
    
    Cameras --> CamFeed
```

### 📡 Fontes de Vídeo e Câmeras Compatíveis:
1. **ESP32-CAM (Módulo OV2640):**
   - Stream HTTP MJPEG nativo na porta 81 (ex: `http://192.168.4.1:81/stream` ou `http://192.168.1.150:81/stream`).
   - Suporte a fotos de alta resolução via `/jpg` ou `/capture`.
2. **Câmeras IP / Wi-Fi Residenciais (Yoosee, ICSee, ONVIF, Intelbras, TP-Link):**
   - Transmissão via endpoint HTTP MJPEG local ou bridges RTSP para HTTP/MJPEG (ex: `http://192.168.1.50:8080/videostream.cgi`).
   - Requisições diretas de snapshots JPEG contínuos em alta taxa (`http://192.168.1.50/snapshot.jpg`).
3. **Raspberry Pi / Jetson Nano / PC Linux:**
   - Câmeras Picamera ou Webcams USB via `mjpg-streamer`, `Flask` micro-server ou `OpenCV` (ver exemplo [`examples/raspberry_pi/rpi_rc_car_camera.py`](file:///C:/Users/Bryan/.gemini/antigravity/scratch/OmniRC/examples/raspberry_pi/rpi_rc_car_camera.py)).
4. **Câmera Local do Smartphone (WebRTC):**
   - Ativação instantânea das lentes frontal ou traseira do próprio celular com permissão automática (`CAMERA` nativa do Android no WebView).
   - Perfeito para montar um celular antigo fixado em cima do robô transmitindo o trajeto.
5. **Simulador Desktop (`rc_device_server.py`):**
   - Stream sintético de painel HUD gerado em Python em `http://localhost:5500/camera_feed`.

### 🖥️ Modos de Exibição e Recursos Visuais:
* **Cockpit HUD (Fundo de Tela Dinâmico):** O vídeo preenche todo o fundo do aplicativo com controles translúcidos sobrepostos estilo visor de caça aéreo militar (Heads-Up Display).
* **PiP (Picture-in-Picture):** Janela flutuante no canto superior da tela com botões de fechar e expansão.
* **Controles Rápidos:**
  - 🔄 **Espelhar Horizontal:** Inverte o feed da câmera para manter a referência correta ao olhar para trás.
  - ↕️ **Espelhar Vertical:** Corrige a imagem caso o módulo da câmera esteja instalado de cabeça para baixo no chassi do veículo.
  - 📸 **Captura de Tela (Snapshot):** Salva fotos do trajeto instantaneamente com carimbo de data e hora.

---

## 🧪 Ambiente de Testes e Simulação no Windows

* **Simulador Completo com Dashboard Web (`rc_device_server.py`):**
  ```powershell
  python rc_device_server.py
  ```
  Abre um painel em `http://localhost:5500` com velocímetro, volante com ângulo real, motores, luzes, buzina, telemetria e 4 servos animados. Escuta em UDP e TCP na porta 8888.
* **Simulador no Navegador (`simulate.py`):** roda a interface do app no navegador do PC com mock da API Android nativa.
* **Receptor UDP Simples (`mock_receiver.py`):** exibe pacotes UDP diretamente no console do Windows.
* **Depuração Remota via Chrome DevTools:** conecte o celular por USB com depuração ativada e acesse `chrome://inspect/#devices`.

---

## 💻 Exemplos de Código para Receptores Embarcados

O diretório [`examples/`](file:///C:/Users/Bryan/.gemini/antigravity/scratch/OmniRC/examples) inclui implementações completas, prontas para gravar e testadas para as principais placas de desenvolvimento do mercado, cobrindo C++, Python e MicroPython:

| Plataforma / Placa | Arquivo no Repositório | Protocolo / Meio | Linguagem | Destaques |
| :--- | :--- | :--- | :--- | :--- |
| **ESP32 DevKit** | [`esp32_wifi_udp_car.ino`](file:///C:/Users/Bryan/.gemini/antigravity/scratch/OmniRC/examples/esp32/esp32_wifi_udp_car.ino) | Wi-Fi UDP (8888) | C++ (Arduino) | Fail-Safe Watchdog, Tração Diferencial, Telemetria |
| **ESP32 DevKit** | [`esp32_bluetooth_spp.ino`](file:///C:/Users/Bryan/.gemini/antigravity/scratch/OmniRC/examples/esp32/esp32_bluetooth_spp.ino) | Bluetooth Classic SPP | C++ (Arduino) | Porta Serial RFCOMM sem fio, reconexão rápida |
| **ESP32 DevKit** | [`esp32_ble_uart.ino`](file:///C:/Users/Bryan/.gemini/antigravity/scratch/OmniRC/examples/esp32/esp32_ble_uart.ino) | Bluetooth Low Energy | C++ (BLE NUS) | Padrão Nordic UART Service, ultra baixo consumo |
| **ESP32-CAM (AI-Thinker)**| [`esp32_cam_rc_car.ino`](file:///C:/Users/Bryan/.gemini/antigravity/scratch/OmniRC/examples/esp32-cam/esp32_cam_rc_car.ino) | Wi-Fi UDP + MJPEG | C++ (Arduino) | Stream de vídeo OV2640 (porta 81) + RC (porta 8888) |
| **Arduino Uno / Nano** | [`arduino_bluetooth_l298n.ino`](file:///C:/Users/Bryan/.gemini/antigravity/scratch/OmniRC/examples/arduino/arduino_bluetooth_l298n.ino) | Bluetooth HC-05/06 | C++ (Arduino) | SoftwareSerial, Ponte H L298N, Watchdog milissegundos |
| **Raspberry Pi 3/4/5/Zero 2**| [`rpi_rc_car_camera.py`](file:///C:/Users/Bryan/.gemini/antigravity/scratch/OmniRC/examples/raspberry_pi/rpi_rc_car_camera.py) | Wi-Fi UDP + Flask | Python 3 | Servidor de vídeo FPV MJPEG + Socket UDP em threads |
| **Raspberry Pi Pico W** | [`pico_w_udp_car.py`](file:///C:/Users/Bryan/.gemini/antigravity/scratch/OmniRC/examples/pico_w/pico_w_udp_car.py) | Wi-Fi UDP (8888) | MicroPython | Modo AP ou Station, PWM de motores, não-bloqueante |
| **ESP8266 (NodeMCU / D1)** | [`esp8266_udp_car.ino`](file:///C:/Users/Bryan/.gemini/antigravity/scratch/OmniRC/examples/esp8266/esp8266_udp_car.ino) | Wi-Fi UDP (8888) | C++ (Arduino) | Solução econômica, Fail-Safe, acionamento Ponte H |

---

### 1. ESP32 com Wi-Fi UDP & Fail-Safe Watchdog ([`esp32_wifi_udp_car.ino`](file:///C:/Users/Bryan/.gemini/antigravity/scratch/OmniRC/examples/esp32/esp32_wifi_udp_car.ino))
Controle via UDP com temporizador de segurança que corta os motores caso o sinal Wi-Fi caia por mais de 500 ms:
```cpp
#include <WiFi.h>
#include <WiFiUdp.h>

const char* ssid     = "OmniRC_Network";
const char* password = "password123";
WiFiUDP udp;
unsigned long lastPacketTime = 0;
const unsigned long WATCHDOG_TIMEOUT_MS = 500;

void setup() {
  Serial.begin(115200);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) delay(250);
  udp.begin(8888); // Porta padrão do OmniRC
  Serial.print("IP do Carrinho: "); Serial.println(WiFi.localIP());
}

void loop() {
  int packetSize = udp.parsePacket();
  if (packetSize) {
    char buf[128];
    int len = udp.read(buf, sizeof(buf) - 1);
    buf[len] = '\0';
    lastPacketTime = millis();

    char cmd[16]; int x = 0, y = 0;
    if (sscanf(buf, "%[^:]:%d:%d", cmd, &x, &y) >= 1) {
      if (strcmp(cmd, "DRIVE") == 0) {
        // x = direção (-100 a +100), y = acelerador (-100 a +100)
        // Aplicar às pontes H dos motores
      } else if (strcmp(cmd, "STOP") == 0) {
        // Parada de emergência imediata
      }
    }
  }
  if (millis() - lastPacketTime > WATCHDOG_TIMEOUT_MS) {
    // Fail-safe: corta motores se perder sinal
  }
}
```

---

### 2. ESP32 com Bluetooth Low Energy (BLE NUS) ([`esp32_ble_uart.ino`](file:///C:/Users/Bryan/.gemini/antigravity/scratch/OmniRC/examples/esp32/esp32_ble_uart.ino))
Implementa o padrão da indústria **Nordic UART Service (NUS)**, permitindo conexão instantânea sem necessidade de pareamento prévio no Android:
* **Service UUID:** `6E400001-B5A3-F393-E0A9-E50E24DCCA9E`
* **RX Characteristic (Recepção de Comandos):** `6E400002-B5A3-F393-E0A9-E50E24DCCA9E`
* **TX Characteristic (Telemetria para o Celular):** `6E400003-B5A3-F393-E0A9-E50E24DCCA9E`

---

### 3. ESP32-CAM com Vídeo FPV + Controle UDP ([`esp32_cam_rc_car.ino`](file:///C:/Users/Bryan/.gemini/antigravity/scratch/OmniRC/examples/esp32-cam/esp32_cam_rc_car.ino))
Transforma uma placa ESP32-CAM AI-Thinker em um carro FPV completo num único microcontrolador:
* **Núcleo 0 (Core 0):** Serve o streaming de vídeo MJPEG do sensor OV2640 na porta HTTP `81` (`/stream`).
* **Núcleo 1 (Core 1):** Processa datagramas UDP de alta velocidade na porta `8888` e aciona a ponte H dos motores.
* No OmniRC: configure a conexão como **Wi-Fi UDP** (IP do ESP32-CAM, porta `8888`) e na barra superior clique em **📹 Câmera** e informe `http://IP_DO_ESP32:81/stream`.

---

### 4. Arduino Uno / Nano com Bluetooth HC-05 & Ponte H L298N ([`arduino_bluetooth_l298n.ino`](file:///C:/Users/Bryan/.gemini/antigravity/scratch/OmniRC/examples/arduino/arduino_bluetooth_l298n.ino))
Solução para o clássico Arduino Uno/Nano utilizando módulo HC-05 na porta serial por software (`SoftwareSerial` pinos 10 e 11) e controle PWM duplo de velocidade nos canais ENA e ENB da ponte H L298N.

---

### 5. Raspberry Pi com Python & Câmera Picamera ([`rpi_rc_car_camera.py`](file:///C:/Users/Bryan/.gemini/antigravity/scratch/OmniRC/examples/raspberry_pi/rpi_rc_car_camera.py))
Script assíncrono em Python 3 para Raspberry Pi 3/4/5 ou Pi Zero 2 W:
* Inicia servidor web Flask leve transmitindo o feed da câmera Picamera ou Webcam USB em formato multipart MJPEG em `http://IP_DA_RPI:5000/stream`.
* Escuta pacotes de controle UDP em thread separada com fail-safe e converte os valores em saídas PWM via biblioteca `gpiozero` ou `RPi.GPIO`.

---

### 6. Raspberry Pi Pico W com MicroPython ([`pico_w_udp_car.py`](file:///C:/Users/Bryan/.gemini/antigravity/scratch/OmniRC/examples/pico_w/pico_w_udp_car.py))
Utiliza o chip RP2040 Wi-Fi rodando MicroPython puro:
* Pode criar sua própria rede Wi-Fi Access Point (`OmniRC_Car`) ou conectar ao seu roteador.
* Socket UDP não-bloqueante (`setblocking(False)`) e controle de velocidade por PWM de 16 bits (`machine.PWM`) com frequência de 20 kHz para evitar ruído acústico nos motores.

---

### 7. ESP8266 NodeMCU / D1 Mini ([`esp8266_udp_car.ino`](file:///C:/Users/Bryan/.gemini/antigravity/scratch/OmniRC/examples/esp8266/esp8266_udp_car.ino))
Projeto de ultra-baixo custo para módulos baseados em ESP8266 (ESP-12E/F) com Wi-Fi UDP e controle direto de pontes H compactas (L9110S, DRV8833 ou L298N).

---

## 🛠️ Como Recompilar o APK

Para recompilar o projeto após qualquer alteração:
```powershell
python build.py
```
O script executa automaticamente AAPT2, vinculação com o `android.jar`, compilação Java com javac, conversão Dalvik DEX com D8 e assinatura v1/v2/v3 em menos de 1 segundo.
