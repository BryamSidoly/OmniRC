import http.server
import socketserver
import socket
import threading
import json
import os
import time
import datetime
import webbrowser
import math
import protocol_decoder

HTTP_PORT = 5500
UDP_PORT = 8888
TCP_PORT = 8888

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SERVER_HTML = os.path.join(BASE_DIR, "server", "index.html")

# Global device state
state_lock = threading.RLock()
device_state = {
    # Carro RC / Rover / Tanque
    "throttle": 0,
    "steering": 0,
    "leftMotor": 0,
    "rightMotor": 0,
    "lights": False,
    "horn": False,
    "turbo": False,
    "gear": 1,
    "emergencyStop": False,
    # Braço Robótico / Servos
    "s1": 90,
    "s2": 90,
    "s3": 90,
    "s4": 30,
    # Aeromodelismo (Drones, Aviões, Helicópteros)
    "aeroRoll": 0,
    "aeroPitch": 0,
    "aeroThrottle": 0,
    "aeroYaw": 0,
    "armed": False,
    "flightMode": "ANGLE / STAB",
    "flaps": 0,
    "gear": False,
    "channels": [1500, 1500, 1000, 1500, 1000, 1500, 1000, 1000] + [1500] * 8, # 16 canais em µs
    # Gimbal / Câmera FPV Pan-Tilt
    "gimbalX": 90,
    "gimbalY": 90,
    # Sensores do Smartphone (Giroscópio / Acelerômetro)
    "sensorPitch": 0.0,
    "sensorRoll": 0.0,
    "sensorYaw": 0.0,
    "sensorAx": 0.0,
    "sensorAy": 0.0,
    "sensorAz": 9.8,
    # Elementos do Layout Personalizado
    "customElements": {},
    # Protocolo Detectado
    "protocolDetected": "AGUARDANDO..."
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
        if len(stats["new_logs"]) > 60:
            stats["new_logs"].pop(0)

def parse_incoming_command(raw_data, addr):
    if not raw_data:
        return

    with state_lock:
        stats["packet_count"] += 1
        stats["last_packet_time"] = time.time()
        stats["client_ip"] = addr[0]
        stats["client_port"] = addr[1]

    decoded = protocol_decoder.decode_packet(raw_data)
    proto = decoded.get("protocol", "UNKNOWN")
    dtype = decoded.get("type", "unknown")
    summary = decoded.get("summary", "")

    with state_lock:
        device_state["protocolDetected"] = proto

        if dtype == "aero":
            aero = decoded["aero"]
            device_state["aeroRoll"] = aero["roll"]
            device_state["aeroPitch"] = aero["pitch"]
            device_state["aeroThrottle"] = aero["throttle"]
            device_state["aeroYaw"] = aero["yaw"]
            device_state["armed"] = aero["armed"]
            device_state["flightMode"] = aero["mode"]
            device_state["flaps"] = aero["flaps"]
            device_state["gear"] = aero["gear"]
            device_state["channels"] = decoded["channels"]
            # Espelha nos canais primários para navegação fluida
            device_state["steering"] = aero["roll"]
            device_state["throttle"] = aero["throttle"]
            device_state["leftMotor"] = max(-100, min(100, aero["throttle"] + aero["yaw"]))
            device_state["rightMotor"] = max(-100, min(100, aero["throttle"] - aero["yaw"]))
            device_state["emergencyStop"] = False
            add_log(summary, "aero")

        elif dtype == "drive":
            drv = decoded["drive"]
            device_state["steering"] = drv["steering"]
            device_state["throttle"] = drv["throttle"]
            device_state["leftMotor"] = drv["left"]
            device_state["rightMotor"] = drv["right"]
            device_state["emergencyStop"] = False
            add_log(summary, "cmd")

        elif dtype == "gimbal":
            gx = decoded["gimbal"]["x"]
            gy = decoded["gimbal"]["y"]
            device_state["gimbalX"] = gx
            device_state["gimbalY"] = gy
            device_state["s1"] = gx
            device_state["s2"] = gy
            add_log(summary, "event")

        elif dtype == "sensor":
            s = decoded["sensor"]
            device_state["sensorPitch"] = s["pitch"]
            device_state["sensorRoll"] = s["roll"]
            device_state["sensorYaw"] = s["yaw"]
            device_state["sensorAx"] = s["ax"]
            device_state["sensorAy"] = s["ay"]
            device_state["sensorAz"] = s["az"]
            add_log(summary, "sensor")

        elif dtype == "custom":
            c = decoded["custom"]
            device_state["customElements"][c["name"]] = c["value"]
            add_log(summary, "custom")

        elif dtype == "flight_status":
            if "armed" in decoded:
                device_state["armed"] = decoded["armed"]
            if "mode" in decoded:
                device_state["flightMode"] = decoded["mode"]
            if "flaps" in decoded:
                device_state["flaps"] = decoded["flaps"]
            if "gear" in decoded:
                device_state["gear"] = decoded["gear"]
            add_log(summary, "aero")

        elif dtype == "channel":
            ch = decoded["channel"]
            val = decoded["value"]
            if 1 <= ch <= 16:
                device_state["channels"][ch - 1] = val
                aero = protocol_decoder.channels_to_aero(device_state["channels"])
                device_state["aeroRoll"] = aero["roll"]
                device_state["aeroPitch"] = aero["pitch"]
                device_state["aeroThrottle"] = aero["throttle"]
                device_state["aeroYaw"] = aero["yaw"]
                device_state["armed"] = aero["armed"]
                device_state["flightMode"] = aero["mode"]
            add_log(summary, "channel")

        elif dtype == "stop":
            device_state["throttle"] = 0
            device_state["steering"] = 0
            device_state["leftMotor"] = 0
            device_state["rightMotor"] = 0
            device_state["aeroThrottle"] = 0
            device_state["armed"] = False
            device_state["emergencyStop"] = True
            add_log(summary, "stop")

        elif dtype == "light":
            val = decoded["value"]
            device_state["lights"] = not device_state["lights"] if val is None else (val > 0)
            add_log(summary, "event")

        elif dtype == "horn":
            device_state["horn"] = decoded["value"]
            add_log(summary, "event")

        elif dtype == "turbo":
            device_state["turbo"] = decoded["value"]
            add_log(summary, "event")

        elif dtype == "servo":
            j = decoded["joint"]
            v = decoded["value"]
            device_state[f"s{j}"] = v
            add_log(summary, "event")

        elif dtype == "json":
            js = decoded["json"]
            if "x" in js: device_state["steering"] = int(js["x"])
            if "y" in js: device_state["throttle"] = int(js["y"])
            if "left" in js: device_state["leftMotor"] = int(js["left"])
            if "right" in js: device_state["rightMotor"] = int(js["right"])
            if "roll" in js: device_state["aeroRoll"] = int(js["roll"])
            if "pitch" in js: device_state["aeroPitch"] = int(js["pitch"])
            if "throttle" in js: device_state["aeroThrottle"] = int(js["throttle"])
            if "yaw" in js: device_state["aeroYaw"] = int(js["yaw"])
            if "armed" in js: device_state["armed"] = bool(js["armed"])
            if "mode" in js: device_state["flightMode"] = str(js["mode"])
            add_log(summary, "cmd")

        else:
            add_log(summary, "cmd")

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
            parse_incoming_command(data, addr)
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
        while True:
            data = conn.recv(1024)
            if not data:
                break
            parse_incoming_command(data, addr)
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
        # Silencia logs de requisição comuns para manter o console limpo
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

        elif self.path == "/camera_feed" or self.path == "/stream":
            self.send_response(200)
            self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()

            try:
                from PIL import Image, ImageDraw
                import io

                width, height = 480, 320
                while True:
                    with state_lock:
                        throt = device_state["aeroThrottle"] if "CRSF" in device_state["protocolDetected"] or "SBUS" in device_state["protocolDetected"] or "AERO" in device_state["protocolDetected"] else device_state["throttle"]
                        steer = device_state["aeroRoll"] if "CRSF" in device_state["protocolDetected"] or "SBUS" in device_state["protocolDetected"] or "AERO" in device_state["protocolDetected"] else device_state["steering"]
                        pitch = device_state["aeroPitch"]
                        yaw = device_state["aeroYaw"]
                        armed = device_state["armed"]
                        flight_mode = device_state["flightMode"]
                        proto = device_state["protocolDetected"]
                        gx = device_state.get("gimbalX", 90)
                        gy = device_state.get("gimbalY", 90)

                    # Cria frame visual
                    img = Image.new("RGB", (width, height), (12, 18, 30))
                    draw = ImageDraw.Draw(img)

                    # Horizonte Artificial (Céu e Terra)
                    horizon_y = height // 2 - int(pitch * 0.9)
                    roll_offset = int(steer * 0.9)
                    
                    # Terreno
                    draw.polygon([(0, horizon_y + roll_offset), (width, horizon_y - roll_offset), (width, height), (0, height)], fill=(18, 38, 26))
                    # Céu
                    draw.polygon([(0, 0), (width, 0), (width, horizon_y - roll_offset), (0, horizon_y + roll_offset)], fill=(12, 32, 58))
                    # Linha do Horizonte
                    draw.line([(0, horizon_y + roll_offset), (width, horizon_y - roll_offset)], fill=(0, 229, 255), width=2)

                    # Pitch Ladder
                    cx, cy = width // 2, height // 2
                    for p_deg in (-20, -10, 10, 20):
                        py = horizon_y - int(p_deg * 2.5)
                        if 30 <= py <= height - 30:
                            draw.line([(cx - 30, py), (cx + 30, py)], fill=(0, 229, 255), width=1)
                            draw.text((cx + 34, py - 5), f"{p_deg}°", fill=(0, 229, 255))

                    # Retículo Central da Aeronave [ -o- ]
                    draw.line([(cx - 35, cy), (cx - 12, cy)], fill=(0, 255, 136), width=2)
                    draw.line([(cx + 12, cy), (cx + 35, cy)], fill=(0, 255, 136), width=2)
                    draw.ellipse([(cx - 6, cy - 6), (cx + 6, cy + 6)], outline=(0, 255, 136), width=2)

                    # Retículo do Gimbal (se diferente do centro)
                    g_cx = cx + int((gx - 90) * 1.2)
                    g_cy = cy + int((gy - 90) * 1.0)
                    draw.ellipse([(g_cx - 10, g_cy - 10), (g_cx + 10, g_cy + 10)], outline=(255, 184, 0), width=1)
                    draw.point((g_cx, g_cy), fill=(255, 184, 0))

                    # Barra Superior: Bússola / Yaw
                    draw.rectangle([(cx - 80, 5), (cx + 80, 24)], fill=(10, 15, 25), outline=(42, 54, 79))
                    heading = int((yaw + 100) * 1.8) % 360
                    draw.text((cx - 35, 8), f"HDG {heading:03d}°", fill=(0, 255, 136))

                    # Barra Lateral Esquerda: Airspeed
                    speed_sim = int(abs(throt) * 1.2)
                    draw.rectangle([(10, 60), (45, 180)], fill=(10, 15, 25), outline=(42, 54, 79))
                    draw.text((15, 65), "SPD", fill=(139, 148, 158))
                    draw.text((15, 85), f"{speed_sim}", fill=(0, 229, 255))
                    draw.text((15, 105), "km/h", fill=(139, 148, 158))

                    # Barra Lateral Direita: Altitude
                    alt_sim = int(throt * 1.5)
                    draw.rectangle([(width - 50, 60), (width - 15, 180)], fill=(10, 15, 25), outline=(42, 54, 79))
                    draw.text((width - 45, 65), "ALT", fill=(139, 148, 158))
                    draw.text((width - 45, 85), f"{max(0, alt_sim)}", fill=(0, 229, 255))
                    draw.text((width - 45, 105), "m", fill=(139, 148, 158))

                    # Barra Inferior de Telemetria
                    draw.rectangle([(0, height - 26), (width, height)], fill=(8, 12, 20))
                    now_str = datetime.datetime.now().strftime("%H:%M:%S")
                    arm_str = "ARMED" if armed else "DISARMED"
                    arm_color = (0, 255, 136) if armed else (255, 51, 102)

                    draw.text((8, height - 20), f"PROTO: {proto}", fill=(0, 229, 255))
                    draw.text((135, height - 20), f"MODE: {flight_mode[:8]}", fill=(255, 184, 0))
                    draw.text((250, height - 20), arm_str, fill=arm_color)
                    draw.text((330, height - 20), "BATT: 15.6V", fill=(0, 255, 136))
                    draw.text((415, height - 20), now_str, fill=(139, 148, 158))

                    buf = io.BytesIO()
                    img.save(buf, format="JPEG", quality=75)
                    jpeg_bytes = buf.getvalue()

                    part = (b"--frame\r\n"
                            b"Content-Type: image/jpeg\r\n"
                            b"Content-Length: " + str(len(jpeg_bytes)).encode() + b"\r\n\r\n" +
                            jpeg_bytes + b"\r\n")
                    self.wfile.write(part)
                    self.wfile.flush()
                    time.sleep(0.05) # ~20 FPS
            except Exception:
                pass
            return

        self.send_response(404)
        self.end_headers()

def main():
    print("=" * 72)
    print("  🚀 OmniRC - Servidor & Simulador de Dispositivo Multi-Protocolo")
    print("  Suporta: CRSF, SBUS, IBUS, MAVLink, MSP, Aeromodelos, Carros, Braço, Câmeras")
    print("=" * 72)

    ips = get_local_ips()
    print("Para conectar o aplicativo OmniRC no celular:")
    print("1. Conecte o celular na mesma rede Wi-Fi.")
    print("2. Abra o OmniRC e selecione o protocolo desejado (Wi-Fi, CRSF, SBUS, etc.).")
    print("3. Digite um destes IPs e porta 8888:")
    for ip in ips:
        print(f"   -> IP: {ip} | Porta: {UDP_PORT}")
    print("=" * 72)
    print(f"Abrindo Cockpit Visual em: http://localhost:{HTTP_PORT}")
    print(f"Stream de Câmera FPV em: http://localhost:{HTTP_PORT}/stream")
    print("=" * 72)
    print("Aguardando pacotes dos joysticks... (Pressione Ctrl+C para sair)\n")

    # Iniciar receptor UDP
    t_udp = threading.Thread(target=udp_worker, daemon=True)
    t_udp.start()

    # Iniciar receptor TCP
    t_tcp = threading.Thread(target=tcp_worker, daemon=True)
    t_tcp.start()

    # Abrir navegador
    webbrowser.open(f"http://localhost:{HTTP_PORT}")

    # Iniciar servidor HTTP
    server_address = ("", HTTP_PORT)
    httpd = socketserver.ThreadingTCPServer(server_address, SimulatorHTTPHandler)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor encerrado pelo usuário.")

if __name__ == "__main__":
    main()
