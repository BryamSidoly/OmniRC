import http.server
import socketserver
import socket
import threading
import json
import os
import time
import datetime
import webbrowser
import re

HTTP_PORT = 5500
UDP_PORT = 8888
TCP_PORT = 8888

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SERVER_HTML = os.path.join(BASE_DIR, "server", "index.html")

# Global device state
state_lock = threading.RLock()
device_state = {
    "throttle": 0,
    "steering": 0,
    "leftMotor": 0,
    "rightMotor": 0,
    "lights": False,
    "horn": False,
    "turbo": False,
    "gear": 1,
    "emergencyStop": False,
    "s1": 90,
    "s2": 90,
    "s3": 90,
    "s4": 30
}

stats = {
    "packet_count": 0,
    "last_packet_time": 0,
    "client_ip": None,
    "client_port": None,
    "new_logs": []
}

def get_local_ips():
    try:
        hostname = socket.gethostname()
        ips = socket.gethostbyname_ex(hostname)[2]
        return [ip for ip in ips if not ip.startswith("127.")]
    except Exception:
        return ["127.0.0.1"]

def add_log(text, log_type="cmd"):
    now = datetime.datetime.now().strftime("%H:%M:%S.%f")[:-3]
    entry = {"time": now, "text": f"[{now}] {text}", "type": log_type}
    with state_lock:
        stats["new_logs"].append(entry)
        if len(stats["new_logs"]) > 50:
            stats["new_logs"].pop(0)

def parse_incoming_command(raw_msg, addr):
    raw_str = raw_msg.strip()
    if not raw_str:
        return

    with state_lock:
        stats["packet_count"] += 1
        stats["last_packet_time"] = time.time()
        stats["client_ip"] = addr[0]
        stats["client_port"] = addr[1]

    # Try JSON format first
    if raw_str.startswith("{") and raw_str.endswith("}"):
        try:
            data = json.loads(raw_str)
            cmd = data.get("cmd", "")
            with state_lock:
                if "x" in data:
                    device_state["steering"] = int(data["x"])
                if "y" in data:
                    device_state["throttle"] = int(data["y"])
                if "left" in data:
                    device_state["leftMotor"] = int(data["left"])
                if "right" in data:
                    device_state["rightMotor"] = int(data["right"])
                else:
                    y = device_state["throttle"]
                    x = device_state["steering"]
                    device_state["leftMotor"] = max(-100, min(100, y + x))
                    device_state["rightMotor"] = max(-100, min(100, y - x))
            add_log(f"JSON: {raw_str}", "cmd")
            return
        except Exception:
            pass

    # Delimited format: CMD,P1,P2... or CMD:P1:P2...
    tokens = re.split(r"[,:\s]+", raw_str)
    cmd = tokens[0].upper()

    with state_lock:
        if cmd == "DRIVE":
            # DRIVE,x,y
            try:
                x = int(tokens[1]) if len(tokens) > 1 else 0
                y = int(tokens[2]) if len(tokens) > 2 else 0
                device_state["steering"] = x
                device_state["throttle"] = y
                device_state["emergencyStop"] = False
                # Calculate differential
                device_state["leftMotor"] = max(-100, min(100, y + x))
                device_state["rightMotor"] = max(-100, min(100, y - x))
            except Exception:
                pass
            add_log(f"DRIVE -> X:{device_state['steering']}% Y:{device_state['throttle']}% (L:{device_state['leftMotor']} R:{device_state['rightMotor']})", "cmd")

        elif cmd == "TANK":
            # TANK,left,right
            try:
                l = int(tokens[1]) if len(tokens) > 1 else 0
                r = int(tokens[2]) if len(tokens) > 2 else 0
                device_state["leftMotor"] = l
                device_state["rightMotor"] = r
                device_state["throttle"] = (l + r) // 2
                device_state["steering"] = (l - r) // 2
                device_state["emergencyStop"] = False
            except Exception:
                pass
            add_log(f"TANK -> Esteira Esq:{device_state['leftMotor']}% | Esteira Dir:{device_state['rightMotor']}%", "cmd")

        elif cmd in ("STOP", "S"):
            device_state["throttle"] = 0
            device_state["steering"] = 0
            device_state["leftMotor"] = 0
            device_state["rightMotor"] = 0
            device_state["emergencyStop"] = True
            add_log("🛑 PARADA DE EMERGÊNCIA ATIVADA (MOTORES PARADOS)", "stop")

        elif cmd == "LIGHT":
            val = int(tokens[1]) if len(tokens) > 1 and tokens[1].isdigit() else None
            device_state["lights"] = not device_state["lights"] if val is None else (val > 0)
            status_str = "LIGADO" if device_state["lights"] else "DESLIGADO"
            add_log(f"💡 Farol: {status_str}", "event")

        elif cmd == "HORN":
            val = int(tokens[1]) if len(tokens) > 1 and tokens[1].isdigit() else 1
            device_state["horn"] = val > 0
            add_log(f"📢 Buzina: {'ACIONADA' if device_state['horn'] else 'Liberada'}", "event")

        elif cmd == "TURBO":
            val = int(tokens[1]) if len(tokens) > 1 and tokens[1].isdigit() else 1
            device_state["turbo"] = val > 0
            add_log(f"⚡ Turbo: {'ATIVO' if device_state['turbo'] else 'Desligado'}", "event")

        elif cmd.startswith("SRV") or cmd in ("GRIP", "S1", "S2", "S3", "S4"):
            val = int(tokens[1]) if len(tokens) > 1 else 90
            if "1" in cmd: device_state["s1"] = val
            elif "2" in cmd: device_state["s2"] = val
            elif "3" in cmd: device_state["s3"] = val
            elif "4" in cmd or cmd == "GRIP": device_state["s4"] = val
            add_log(f"🦾 Braço Robótico {cmd} -> {val}°", "event")

        # Fallback single letter commands (classic Bluetooth RC car protocol)
        elif len(cmd) == 1:
            if cmd == "F":
                device_state["throttle"] = 80; device_state["steering"] = 0
            elif cmd == "B":
                device_state["throttle"] = -80; device_state["steering"] = 0
            elif cmd == "L":
                device_state["steering"] = -80
            elif cmd == "R":
                device_state["steering"] = 80
            elif cmd in ("G", "I"): # Forward left/right
                device_state["throttle"] = 70; device_state["steering"] = -50 if cmd == "G" else 50
            elif cmd in ("H", "J"): # Backward left/right
                device_state["throttle"] = -70; device_state["steering"] = -50 if cmd == "H" else 50
            add_log(f"Comando Simples: '{cmd}'", "cmd")

        else:
            add_log(f"Comando Genérico: '{raw_str}'", "cmd")

# ==========================================
# UDP LISTENER THREAD
# ==========================================
def udp_worker():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)

    try:
        sock.bind(("0.0.0.0", UDP_PORT))
    except OSError as e:
        print(f"[UDP] ERRO AO ABRIR PORTA {UDP_PORT}: {e}")
        sock.close()
        return

    print(f"[UDP] Ouvindo na porta {UDP_PORT} em todas as interfaces...")
    print(f"[UDP] Endereço: 0.0.0.0:{UDP_PORT}")

    while True:
        try:
            data, addr = sock.recvfrom(2048)

            try:
                msg = data.decode("utf-8").strip()
            except UnicodeDecodeError:
                msg = data.hex(" ")

            print(f"[UDP RX] {addr[0]}:{addr[1]} -> {msg}")

            parse_incoming_command(msg, addr)

        except Exception as e:
            print(f"[UDP] ERRO: {type(e).__name__}: {e}")
            
# ==========================================
# TCP LISTENER THREAD
# ==========================================
def tcp_client_handler(conn, addr):
    with state_lock:
        stats["client_ip"] = addr[0]
        stats["client_port"] = addr[1]
    add_log(f"TCP Cliente conectado de {addr[0]}:{addr[1]}", "connect")

    try:
        buffer = ""
        while True:
            data = conn.recv(1024)
            if not data:
                break
            buffer += data.decode("utf-8", errors="ignore")
            while "\n" in buffer:
                line, buffer = buffer.split("\n", 1)
                parse_incoming_command(line, addr)
    except Exception:
        pass
    finally:
        conn.close()
        add_log(f"TCP Cliente desconectado de {addr[0]}", "event")

def tcp_worker():
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind(("0.0.0.0", TCP_PORT))
    sock.listen(5)
    print(f"[TCP] Ouvindo conexões na porta {TCP_PORT}...")

    while True:
        try:
            conn, addr = sock.accept()
            t = threading.Thread(target=tcp_client_handler, args=(conn, addr), daemon=True)
            t.start()
        except Exception:
            time.sleep(0.05)

# ==========================================
# HTTP SERVER & SSE STREAM
# ==========================================
class SimulatorHTTPHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Silence default request logging to keep console clean
        return

    def do_GET(self):
        if self.path == "/" or self.path == "/index.html":
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            with open(SERVER_HTML, "rb") as f:
                self.wfile.write(f.read())
            return

        elif self.path == "/api/ips":
            ips = get_local_ips()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(ips).encode("utf-8"))
            return

        elif self.path == "/api/state":
            with state_lock:
                logs_to_send = list(stats["new_logs"])
                stats["new_logs"].clear()
                payload = {
                    "state": device_state,
                    "packet_count": stats["packet_count"],
                    "client_ip": stats["client_ip"],
                    "client_port": stats["client_port"],
                    "new_logs": logs_to_send
                }
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(payload).encode("utf-8"))
            return

        elif self.path == "/events":
            # Server-Sent Events (SSE)
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()

            try:
                while True:
                    with state_lock:
                        logs_to_send = list(stats["new_logs"])
                        stats["new_logs"].clear()
                        data = {
                            "state": device_state,
                            "packet_count": stats["packet_count"],
                            "client_ip": stats["client_ip"],
                            "client_port": stats["client_port"],
                            "new_logs": logs_to_send
                        }
                    sse_msg = f"data: {json.dumps(data)}\n\n"
                    self.wfile.write(sse_msg.encode("utf-8"))
                    self.wfile.flush()
                    time.sleep(0.04) # ~25 FPS stream
            except Exception:
                pass
            return

        self.send_response(404)
        self.end_headers()

def main():
    print("=" * 65)
    print("  🚗 OmniRC - Servidor & Simulador de Dispositivo RC")
    print("=" * 65)

    ips = get_local_ips()
    print("Para conectar o aplicativo OmniRC no celular:")
    print("1. Conecte o celular na mesma rede Wi-Fi.")
    print("2. Abra o OmniRC e clique em '📡 Conexão' > 'Wi-Fi'.")
    print("3. Digite um destes IPs e porta 8888:")
    for ip in ips:
        print(f"   -> IP: {ip} | Porta: {UDP_PORT}")
    print("=" * 65)
    print(f"Abrindo Dashboard do Simulador em: http://localhost:{HTTP_PORT}")
    print("=" * 65)
    print("Aguardando pacotes dos joysticks... (Pressione Ctrl+C para sair)\n")

    # Start UDP listener
    t_udp = threading.Thread(target=udp_worker, daemon=True)
    t_udp.start()

    # Start TCP listener
    t_tcp = threading.Thread(target=tcp_worker, daemon=True)
    t_tcp.start()

    # Open visual cockpit in browser
    webbrowser.open(f"http://localhost:{HTTP_PORT}")

    # Start HTTP dashboard
    server_address = ("", HTTP_PORT)
    httpd = socketserver.ThreadingTCPServer(server_address, SimulatorHTTPHandler)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor encerrado pelo usuário.")

if __name__ == "__main__":
    main()
