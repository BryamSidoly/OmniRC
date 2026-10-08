import socket
import datetime
import sys

UDP_PORT = 8888
TCP_PORT = 8888

def start_udp_receiver():
    hostname = socket.gethostname()
    try:
        ips = socket.gethostbyname_ex(hostname)[2]
    except Exception:
        ips = ["127.0.0.1"]

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind(("0.0.0.0", UDP_PORT))

    print("=" * 65)
    print("  🚗 OmniRC - Receptor Simulado de Teste (ESP32 / RC Toy)")
    print("=" * 65)
    print(f"Ouvindo na porta UDP {UDP_PORT} em todas as interfaces de rede.")
    print("Coloque um destes IPs no aplicativo OmniRC (aba Wi-Fi):")
    for ip in ips:
        print(f" -> IP: {ip} | Porta: {UDP_PORT}")
    print("=" * 65)
    print("Aguardando pacotes dos joysticks e comandos... (Ctrl+C para sair)\n")

    packet_count = 0
    try:
        while True:
            data, addr = sock.recvfrom(2048)
            packet_count += 1
            now = datetime.datetime.now().strftime("%H:%M:%S.%f")[:-3]
            try:
                decoded = data.decode("utf-8").strip()
            except UnicodeDecodeError:
                decoded = data.hex(" ")

            # Print formatted log
            print(f"[{now}] #{packet_count:<4} de {addr[0]}:{addr[1]} -> {decoded}")
    except KeyboardInterrupt:
        print("\nReceptor finalizado.")
    finally:
        sock.close()

if __name__ == "__main__":
    start_udp_receiver()
