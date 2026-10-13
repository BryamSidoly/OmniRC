import http.server
import socketserver
import socket
import threading
import webbrowser
import os
import urllib.parse
import json
import datetime
import protocol_decoder

PORT = 8000
UDP_LISTEN_PORT = 8888
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ASSETS_DIR = os.path.join(BASE_DIR, "assets")

# Mock UDP sender socket
udp_sender_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
target_udp_host = "127.0.0.1"
target_udp_port = UDP_LISTEN_PORT

class SimulatorHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ASSETS_DIR, **kwargs)

    def do_POST(self):
        if self.path.startswith("/api/send_packet"):
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length).decode("utf-8")
            try:
                data = json.loads(body)
                raw_payload = data.get("data", "")
                is_hex = data.get("isHex", False)

                if is_hex:
                    clean = "".join(c for c in raw_payload if c in "0123456789abcdefABCDEF")
                    packet_bytes = bytes.fromhex(clean)
                else:
                    packet_bytes = raw_payload.encode("utf-8")

                # Send via UDP to target
                udp_sender_socket.sendto(packet_bytes, (target_udp_host, target_udp_port))

                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(b'{"status":"ok"}')
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(str(e).encode())
            return

        super().do_POST()

    def do_GET(self):
        # Serve modified index.html that injects the Windows Mock Bridge
        if self.path == "/" or self.path == "/index.html":
            index_path = os.path.join(ASSETS_DIR, "index.html")
            with open(index_path, "r", encoding="utf-8") as f:
                content = f.read()

            mock_bridge = """
            <script>
            // MOCK WINDOW.ANDROID PARA TESTES NO NAVEGADOR NO WINDOWS
            if (!window.Android) {
                console.log("%c[OmniRC Simulator] Mock Native Android Bridge Ativo!", "color:#00E5FF; font-weight:bold; font-size:14px;");
                window.Android = {
                    connectWifi: function(mode, host, port) {
                        console.log(`[Android Mock] Conectando Wi-Fi ${mode} em ${host}:${port}`);
                        setTimeout(() => {
                            if (window.onNativeStatus) window.onNativeStatus("CONNECTED", `Wi-Fi ${mode} -> ${host}:${port}`);
                        }, 200);
                    },
                    connectBluetooth: function(type, addr) {
                        console.log(`[Android Mock] Conectando Bluetooth ${type} em ${addr}`);
                        setTimeout(() => {
                            if (window.onNativeStatus) window.onNativeStatus("CONNECTED", `BT ${type} Conectado: ${addr}`);
                        }, 300);
                    },
                    connectUsbSerial: function(baudRate) {
                        console.log(`[Android Mock] Adaptador de Rádio USB/OTG Conectado em ${baudRate} baud (RadioMaster / ELRS Dongle)`);
                        setTimeout(() => {
                            if (window.onNativeStatus) window.onNativeStatus("CONNECTED", `USB Serial Conectado: ${baudRate} baud`);
                        }, 200);
                    },
                    disconnectUsbSerial: function() {
                        console.log("[Android Mock] Rádio USB Serial desconectado");
                        if (window.onNativeStatus) window.onNativeStatus("DISCONNECTED", "USB Serial Desconectado");
                    },
                    listUsbDevices: function() {
                        return JSON.stringify([
                            {name: "RadioMaster TX16S (VCP)", vendorId: 1155, productId: 22336},
                            {name: "ExpressLRS USB Dongle (CP2102)", vendorId: 4292, productId: 60000}
                        ]);
                    },
                    disconnect: function() {
                        console.log("[Android Mock] Desconectado");
                        if (window.onNativeStatus) window.onNativeStatus("DISCONNECTED", "Desconectado");
                    },
                    sendPacket: function(data, isHex) {
                        // Envia para o receptor local via endpoint do Python
                        fetch('/api/send_packet', {
                            method: 'POST',
                            headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify({data: data, isHex: isHex})
                        }).catch(e => console.error("Erro ao despachar pacote:", e));
                    },
                    scanBluetooth: function(type) {
                        console.log(`[Android Mock] Escaneando Bluetooth ${type}...`);
                        setTimeout(() => {
                            if (window.onNativeDeviceFound) {
                                if (type === 'BLE') {
                                    window.onNativeDeviceFound("ESP32-RC-BLE", "AA:BB:CC:DD:EE:01", "BLE", -55);
                                    window.onNativeDeviceFound("HM-10-ROBOT", "11:22:33:44:55:66", "BLE", -68);
                                } else {
                                    window.onNativeDeviceFound("HC-05-CAR", "98:D3:31:FC:01:A2", "CLASSIC", 0);
                                    window.onNativeDeviceFound("HC-06-ROVER", "98:D3:31:FB:02:B3", "CLASSIC", 0);
                                }
                            }
                        }, 500);
                    },
                    getPairedDevicesJson: function() {
                        return JSON.stringify([
                            {name: "HC-05-RC-CAR", address: "98:D3:31:FC:01:A2"},
                            {name: "ESP32-BT-SPP", address: "24:6F:28:B0:11:22"}
                        ]);
                    },
                    vibrate: function(ms) {
                        console.log(`[Android Mock] Vibração Háptica: ${ms}ms`);
                    },
                    saveConfig: function(key, val) {
                        localStorage.setItem('omnirc_' + key, val);
                    },
                    loadConfig: function(key, def) {
                        return localStorage.getItem('omnirc_' + key) || def;
                    },
                    startSensors: function(rateDelayMs) {
                        console.log(`[Android Mock] Sensores do celular ativados (taxa: ${rateDelayMs}ms)`);
                        if (window._sensorSimInterval) clearInterval(window._sensorSimInterval);
                        let t = 0;
                        window._sensorSimInterval = setInterval(() => {
                            t += 0.05;
                            // Gera pequena oscilação suave simulando smartphone sendo segurado na mão em paisagem
                            const pitch = Math.sin(t * 0.8) * 8.0;
                            const roll = Math.cos(t * 0.6) * 12.0;
                            const yaw = (t * 5.0) % 360;
                            const ax = Math.sin(roll * Math.PI / 180) * 9.8;
                            const ay = -Math.sin(pitch * Math.PI / 180) * 9.8;
                            const az = 9.8;
                            if (window.onNativeSensorData) {
                                window.onNativeSensorData(pitch, roll, yaw, ax, ay, az);
                            }
                        }, rateDelayMs || 50);
                    },
                    stopSensors: function() {
                        console.log("[Android Mock] Sensores do celular desativados");
                        if (window._sensorSimInterval) {
                            clearInterval(window._sensorSimInterval);
                            window._sensorSimInterval = null;
                        }
                    },
                    sendHttpRequest: function(url, method, payload) {
                        console.log(`[Android Mock] HTTP Request -> ${method} ${url}`, payload);
                    },
                    requestPermissions: function() {
                        console.log("[Android Mock] Permissões concedidas");
                    }
                };
            }
            </script>
            """
            # Inject before </head>
            content = content.replace("</head>", mock_bridge + "</head>")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(content.encode("utf-8"))))
            self.end_headers()
            self.wfile.write(content.encode("utf-8"))
            return

        super().do_GET()

def start_udp_listener():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.bind(("0.0.0.0", UDP_LISTEN_PORT))
    except Exception as e:
        print(f"Não foi possível abrir porta UDP {UDP_LISTEN_PORT}: {e}")
        return

    packet_count = 0
    while True:
        try:
            data, addr = sock.recvfrom(2048)
            packet_count += 1
            now = datetime.datetime.now().strftime("%H:%M:%S.%f")[:-3]
            decoded = protocol_decoder.decode_packet(data)
            proto = f"[{decoded['protocol']}]"
            print(f"[{now}] #{packet_count:<4} {proto:<15} -> {decoded['summary']}")
        except Exception:
            break

def run():
    print("=" * 72)
    print("  🚀 OmniRC - Simulador Interativo & Receptor para Windows")
    print("  Suporta: CRSF (ELRS), SBUS, IBUS, MAVLink, MSP, AERO, DRIVE, CUSTOM")
    print("=" * 72)
    print(f"1. Servidor Web iniciado em: http://localhost:{PORT}")
    print(f"2. Receptor UDP ouvindo em: 0.0.0.0:{UDP_LISTEN_PORT}")
    print("3. Abrindo navegador automaticamente...")
    print("=" * 72)
    print("Dica: Movimente os joysticks e aperte os botões no navegador.")
    print("Os pacotes e canais decodificados serão exibidos aqui no terminal em tempo real!")
    print("Pressione Ctrl+C para encerrar.\n")

    # Iniciar receptor UDP em thread separada
    t = threading.Thread(target=start_udp_listener, daemon=True)
    t.start()

    # Abrir navegador
    webbrowser.open(f"http://localhost:{PORT}")

    with socketserver.TCPServer(("", PORT), SimulatorHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nSimulador encerrado.")

if __name__ == "__main__":
    run()
