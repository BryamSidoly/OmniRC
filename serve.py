import http.server
import socketserver
import socket
import os

PORT = 8080
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

def run():
    hostname = socket.gethostname()
    try:
        ips = socket.gethostbyname_ex(hostname)[2]
    except Exception:
        ips = ["127.0.0.1"]

    print("=" * 60)
    print("  OmniRC Servidor de Download de APK para o Celular")
    print("=" * 60)
    print("Conecte seu celular na mesma rede Wi-Fi e abra no navegador:")
    for ip in ips:
        print(f" -> http://{ip}:{PORT}/OmniRC-Remote.apk")
    print("=" * 60)
    print("Pressione Ctrl+C para encerrar o servidor.")

    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServidor finalizado.")

if __name__ == "__main__":
    run()
