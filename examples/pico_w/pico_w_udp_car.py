# OmniRC - Exemplo Raspberry Pi Pico W em MicroPython
# Controle Remoto Wi-Fi UDP com PWM para Ponte H e Watchdog Fail-Safe
#
# Salve este arquivo como `main.py` na raiz do seu Raspberry Pi Pico W!

import network
import socket
import time
from machine import Pin, PWM

# Configuração de Wi-Fi
SSID = "SEU_WIFI_OU_AP"
PASSWORD = "SUA_SENHA"
PORT = 8888

# Pinos da Ponte H (ex: GP16, GP17 para motor A e GP18, GP19 para motor B)
pwm_left_fwd = PWM(Pin(16))
pwm_left_rev = PWM(Pin(17))
pwm_right_fwd = PWM(Pin(18))
pwm_right_rev = PWM(Pin(19))

for p in [pwm_left_fwd, pwm_left_rev, pwm_right_fwd, pwm_right_rev]:
    p.freq(1000)
    p.duty_u16(0)

led = Pin("LED", Pin.OUT)

def set_motors(left, right):
    """Velocidades de -100 a +100"""
    # Motor Esquerdo
    duty_l = int((abs(left) / 100) * 65535)
    if left > 5:
        pwm_left_fwd.duty_u16(duty_l)
        pwm_left_rev.duty_u16(0)
    elif left < -5:
        pwm_left_fwd.duty_u16(0)
        pwm_left_rev.duty_u16(duty_l)
    else:
        pwm_left_fwd.duty_u16(0)
        pwm_left_rev.duty_u16(0)

    # Motor Direito
    duty_r = int((abs(right) / 100) * 65535)
    if right > 5:
        pwm_right_fwd.duty_u16(duty_r)
        pwm_right_rev.duty_u16(0)
    elif right < -5:
        pwm_right_fwd.duty_u16(0)
        pwm_right_rev.duty_u16(duty_r)
    else:
        pwm_right_fwd.duty_u16(0)
        pwm_right_rev.duty_u16(0)

def stop_motors():
    pwm_left_fwd.duty_u16(0)
    pwm_left_rev.duty_u16(0)
    pwm_right_fwd.duty_u16(0)
    pwm_right_rev.duty_u16(0)

# Conexão Wi-Fi
wlan = network.WLAN(network.STA_IF)
wlan.active(True)
wlan.connect(SSID, PASSWORD)

print("Conectando ao Wi-Fi...")
while not wlan.isconnected():
    led.toggle()
    time.sleep(0.2)

ip = wlan.ifconfig()[0]
led.value(1)
print(f"Pico W Conectado! IP: {ip} | Porta UDP: {PORT}")

# Socket UDP
sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sock.bind(('0.0.0.0', PORT))
sock.setblocking(False)

last_packet_time = time.ticks_ms()
TIMEOUT_MS = 600

while True:
    try:
        data, addr = sock.recvfrom(256)
        if data:
            msg = data.decode('utf-8').strip()
            last_packet_time = time.ticks_ms()

            # Processamento de comandos (DRIVE:X:Y)
            parts = msg.replace(',', ':').split(':')
            cmd = parts[0]

            if cmd == "DRIVE" and len(parts) >= 3:
                x = int(parts[1])
                y = int(parts[2])
                left = max(-100, min(100, y + x))
                right = max(-100, min(100, y - x))
                set_motors(left, right)
            elif cmd in ("STOP", "S"):
                stop_motors()

    except OSError:
        pass # Sem dados no momento

    # Fail-Safe Watchdog
    if time.ticks_diff(time.ticks_ms(), last_packet_time) > TIMEOUT_MS:
        stop_motors()

    time.sleep_ms(10)
