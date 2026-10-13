import socket
import datetime
import protocol_decoder

UDP_PORT = 8888

def start_udp_receiver():
    hostname = socket.gethostname()
    try:
        ips = socket.gethostbyname_ex(hostname)[2]
    except Exception:
        ips = ["127.0.0.1"]

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind(("0.0.0.0", UDP_PORT))

    print("=" * 72)
    print("  🚀 OmniRC - Receptor Simulado Universal Multi-Protocolo")
    print("  Suporta: CRSF (ELRS), SBUS, IBUS, MAVLink, MSP, AERO, DRIVE, TANK, CUSTOM")
    print("=" * 72)
    print(f"Ouvindo na porta UDP {UDP_PORT} em todas as interfaces de rede.")
    print("Coloque um destes IPs no aplicativo OmniRC (aba Wi-Fi):")
    for ip in ips:
        print(f" -> IP: {ip} | Porta: {UDP_PORT}")
    print("=" * 72)
    print("Aguardando pacotes dos joysticks, sensores e canais... (Ctrl+C para sair)\n")

    packet_count = 0
    try:
        while True:
            data, addr = sock.recvfrom(2048)
            packet_count += 1
            now = datetime.datetime.now().strftime("%H:%M:%S.%f")[:-3]
            decoded = protocol_decoder.decode_packet(data)
            proto = f"[{decoded['protocol']}]"
            print(f"[{now}] #{packet_count:<4} {addr[0]}:{addr[1]} {proto:<15} -> {decoded['summary']}")
    except KeyboardInterrupt:
        print("\nReceptor finalizado.")
    finally:
        sock.close()

if __name__ == "__main__":
    start_udp_receiver()
