package com.antigravity.omnirc;

import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class NetworkController {
    private static final String TAG = "OmniRC_Net";

    public interface Listener {
        void onStatus(String status, String details);
        void onData(String data);
        void onError(String error);
    }

    private final Listener listener;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final ExecutorService executor = Executors.newCachedThreadPool();

    // UDP State
    private DatagramSocket udpSocket;
    private Thread udpReceiveThread;
    private InetAddress udpTargetAddress;
    private int udpTargetPort = 8888;
    private volatile boolean isUdpRunning = false;

    // TCP State
    private Socket tcpSocket;
    private OutputStream tcpOut;
    private Thread tcpReceiveThread;
    private volatile boolean isTcpConnected = false;

    // Current Mode: "NONE", "UDP", "TCP", "HTTP"
    private String activeMode = "NONE";
    private String targetHost = "192.168.4.1";
    private int targetPort = 8888;

    public NetworkController(Listener listener) {
        this.listener = listener;
    }

    public synchronized void startUdp(String host, int port) {
        disconnect();
        activeMode = "UDP";
        this.targetHost = host;
        this.targetPort = port;

        executor.execute(() -> {
            try {
                udpTargetAddress = InetAddress.getByName(host);
                udpTargetPort = port;
                udpSocket = new DatagramSocket();
                udpSocket.setBroadcast(true);
                isUdpRunning = true;

                postStatus("CONNECTED", "UDP ready -> " + host + ":" + port);

                // Receive loop
                udpReceiveThread = new Thread(() -> {
                    byte[] buf = new byte[2048];
                    while (isUdpRunning && udpSocket != null && !udpSocket.isClosed()) {
                        try {
                            DatagramPacket packet = new DatagramPacket(buf, buf.length);
                            udpSocket.receive(packet);
                            String received = new String(packet.getData(), 0, packet.getLength(), StandardCharsets.UTF_8);
                            postData(received);
                        } catch (Exception e) {
                            if (!isUdpRunning) break;
                            Log.w(TAG, "UDP receive err: " + e.getMessage());
                        }
                    }
                });
                udpReceiveThread.start();
            } catch (Exception e) {
                Log.e(TAG, "UDP start failed", e);
                postError("UDP start failed: " + e.getMessage());
                postStatus("DISCONNECTED", "UDP error");
            }
        });
    }

    public synchronized void startTcp(String host, int port) {
        disconnect();
        activeMode = "TCP";
        this.targetHost = host;
        this.targetPort = port;
        postStatus("CONNECTING", "TCP connecting to " + host + ":" + port);

        executor.execute(() -> {
            try {
                tcpSocket = new Socket();
                tcpSocket.connect(new InetSocketAddress(host, port), 5000);
                tcpOut = tcpSocket.getOutputStream();
                isTcpConnected = true;

                postStatus("CONNECTED", "TCP connected to " + host + ":" + port);

                tcpReceiveThread = new Thread(() -> {
                    try (BufferedReader reader = new BufferedReader(new InputStreamReader(tcpSocket.getInputStream(), StandardCharsets.UTF_8))) {
                        String line;
                        while (isTcpConnected && (line = reader.readLine()) != null) {
                            postData(line);
                        }
                    } catch (Exception e) {
                        if (isTcpConnected) {
                            Log.w(TAG, "TCP connection lost: " + e.getMessage());
                            postStatus("DISCONNECTED", "TCP disconnected: " + e.getMessage());
                        }
                    } finally {
                        isTcpConnected = false;
                    }
                });
                tcpReceiveThread.start();
            } catch (Exception e) {
                Log.e(TAG, "TCP connection failed", e);
                isTcpConnected = false;
                postError("TCP connect error: " + e.getMessage());
                postStatus("DISCONNECTED", "TCP connect failed");
            }
        });
    }

    public void sendData(byte[] bytes) {
        if ("UDP".equals(activeMode)) {
            if (udpSocket != null && !udpSocket.isClosed() && udpTargetAddress != null) {
                executor.execute(() -> {
                    try {
                        DatagramPacket packet = new DatagramPacket(bytes, bytes.length, udpTargetAddress, udpTargetPort);
                        udpSocket.send(packet);
                    } catch (Exception e) {
                        Log.e(TAG, "UDP send error", e);
                    }
                });
            }
        } else if ("TCP".equals(activeMode)) {
            if (tcpOut != null && isTcpConnected) {
                executor.execute(() -> {
                    try {
                        tcpOut.write(bytes);
                        tcpOut.flush();
                    } catch (Exception e) {
                        Log.e(TAG, "TCP send error", e);
                        postError("TCP send failed: " + e.getMessage());
                    }
                });
            }
        }
    }

    public void sendHttp(String urlStr, String method, String payload) {
        executor.execute(() -> {
            HttpURLConnection conn = null;
            try {
                URL url = new URL(urlStr);
                conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod(method != null ? method.toUpperCase() : "GET");
                conn.setConnectTimeout(3000);
                conn.setReadTimeout(3000);

                if ("POST".equalsIgnoreCase(method) && payload != null) {
                    conn.setDoOutput(true);
                    try (OutputStream os = conn.getOutputStream()) {
                        os.write(payload.getBytes(StandardCharsets.UTF_8));
                        os.flush();
                    }
                }

                int code = conn.getResponseCode();
                if (code >= 200 && code < 300) {
                    try (BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
                        StringBuilder sb = new StringBuilder();
                        String line;
                        while ((line = reader.readLine()) != null) {
                            sb.append(line).append("\n");
                        }
                        postData(sb.toString().trim());
                    }
                }
            } catch (Exception e) {
                Log.e(TAG, "HTTP send error", e);
                postError("HTTP error: " + e.getMessage());
            } finally {
                if (conn != null) conn.disconnect();
            }
        });
    }

    public synchronized void disconnect() {
        activeMode = "NONE";
        isUdpRunning = false;
        if (udpSocket != null) {
            try {
                udpSocket.close();
            } catch (Exception ignored) {}
            udpSocket = null;
        }

        isTcpConnected = false;
        if (tcpSocket != null) {
            try {
                tcpSocket.close();
            } catch (Exception ignored) {}
            tcpSocket = null;
        }
        tcpOut = null;

        postStatus("DISCONNECTED", "Wi-Fi disconnected");
    }

    public String getActiveMode() {
        return activeMode;
    }

    private void postStatus(String status, String details) {
        mainHandler.post(() -> listener.onStatus(status, details));
    }

    private void postData(String data) {
        mainHandler.post(() -> listener.onData(data));
    }

    private void postError(String error) {
        mainHandler.post(() -> listener.onError(error));
    }
}
