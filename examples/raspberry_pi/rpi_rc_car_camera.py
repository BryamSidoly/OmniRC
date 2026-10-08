#!/usr/bin/env python3
"""
OmniRC - Exemplo Raspberry Pi (Zero / 3 / 4 / 5) em Python
Controle de Robô RC via UDP + Streaming de Câmera FPV HTTP em Tempo Real

Requisitos:
    pip3 install flask opencv-python gpiozero

Como usar:
    python3 rpi_rc_car_camera.py
    
No aplicativo OmniRC:
    - Em "📹 Câmera", coloque a URL: http://IP_DO_RASPBERRY:8080/video_feed
    - Em "📡 Conexão", selecione Wi-Fi UDP no IP_DO_RASPBERRY e porta 8888!
"""

import socket
import threading
import time
from flask import Flask, Response
import cv2

# Configuração de Rede UDP
UDP_PORT = 8888
HTTP_STREAM_PORT = 8080

# Inicialização da Câmera (OpenCV captura webcam USB ou Picamera via v4l2)
camera = cv2.VideoCapture(0)
camera.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
camera.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

app = Flask(__name__)

# Simulação ou Controle Real de Motores (descomente gpiozero se estiver rodando no Raspberry)
"""
from gpiozero import Motor
motor_left = Motor(forward=17, backward=27)
motor_right = Motor(forward=22, backward=23)
"""

def set_motors(left_speed, right_speed):
    """Velocidades de -100 a +100"""
    # Exemplo real com gpiozero:
    # motor_left.value = left_speed / 100.0
    # motor_right.value = right_speed / 100.0
    print(f"[MOTORES] Esquerdo: {left_speed}% | Direito: {right_speed}%")

def stop_motors():
    # motor_left.stop()
    # motor_right.stop()
    print("[MOTORES] PARADOS")

# Thread do Receptor UDP
def udp_receiver_loop():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind(("0.0.0.0", UDP_PORT))
    print(f"[UDP] Receptor OmniRC ouvindo na porta {UDP_PORT}...")

    last_packet_time = time.time()
    TIMEOUT_SEC = 0.6

    while True:
        sock.settimeout(0.2)
        try:
            data, addr = sock.recvfrom(1024)
            msg = data.decode('utf-8', errors='ignore').strip()
            last_packet_time = time.time()

            # Processamento de comandos (ex: DRIVE:X:Y)
            parts = msg.replace(',', ':').split(':')
            cmd = parts[0]

            if cmd == "DRIVE" and len(parts) >= 3:
                x = int(parts[1])
                y = int(parts[2])
                # Mistura diferencial
                left = max(-100, min(100, y + x))
                right = max(-100, min(100, y - x))
                set_motors(left, right)
            elif cmd == "TANK" and len(parts) >= 3:
                left = int(parts[1])
                right = int(parts[2])
                set_motors(left, right)
            elif cmd in ("STOP", "S"):
                stop_motors()

        except socket.timeout:
            # Fail-Safe Watchdog
            if time.time() - last_packet_time > TIMEOUT_SEC:
                stop_motors()
        except Exception as e:
            print(f"[UDP Erro]: {e}")

# Gerador de Frames MJPEG para a Câmera FPV
def generate_frames():
    while True:
        success, frame = camera.read()
        if not success:
            time.sleep(0.05)
            continue
        
        # Opcional: adicionar texto de telemetria ou mira no frame
        cv2.putText(frame, "OmniRC FPV Live", (20, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 229, 255), 2)

        ret, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
        if not ret:
            continue
        
        frame_bytes = buffer.tobytes()
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')

@app.route('/video_feed')
def video_feed():
    return Response(generate_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/')
def index():
    return "<h1>OmniRC Raspberry Pi Camera Server Online</h1><p>Stream: /video_feed</p>"

if __name__ == '__main__':
    # Inicia a escuta de comandos UDP em thread separada
    udp_thread = threading.Thread(target=udp_receiver_loop, daemon=True)
    udp_thread.start()

    print(f"[HTTP CÂMERA] Servidor FPV iniciado na porta {HTTP_STREAM_PORT}")
    print(f"Coloque no OmniRC a URL: http://<IP_DO_PI>:{HTTP_STREAM_PORT}/video_feed")
    app.run(host='0.0.0.0', port=HTTP_STREAM_PORT, threaded=True)
