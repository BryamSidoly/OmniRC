package com.antigravity.omnirc;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.hardware.usb.UsbConstants;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbEndpoint;
import android.hardware.usb.UsbInterface;
import android.hardware.usb.UsbManager;
import android.os.Build;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * OmniRC Native USB-OTG Serial Controller
 * Directly connects to Radio Transmitters, SiK Telemetry Radios, ExpressLRS / Crossfire modules,
 * and Flight Controllers (Pixhawk, SpeedyBee, Matek, Arduino, ESP32) via USB-OTG.
 * Supports CP210x, CDC-ACM, CH340/CH341, FTDI, and PL2303 chipsets without external dependencies.
 */
public class UsbSerialController {
    private static final String TAG = "UsbSerialController";
    public static final String ACTION_USB_PERMISSION = "com.antigravity.omnirc.USB_PERMISSION";

    public interface Listener {
        void onStatus(String status, String details);
        void onData(String data);
        void onError(String error);
        void onDeviceAttached(String deviceName);
        void onDeviceDetached(String deviceName);
    }

    private final MainActivity activity;
    private final UsbManager usbManager;
    private final Listener listener;

    private UsbDevice connectedDevice = null;
    private UsbDeviceConnection connection = null;
    private UsbInterface claimedInterface = null;
    private UsbEndpoint endpointIn = null;
    private UsbEndpoint endpointOut = null;
    private int currentBaudRate = 115200;
    private int deviceType = TYPE_UNKNOWN;

    private static final int TYPE_UNKNOWN = 0;
    private static final int TYPE_CDC_ACM = 1;
    private static final int TYPE_CP210X   = 2;
    private static final int TYPE_CH340    = 3;
    private static final int TYPE_FTDI     = 4;
    private static final int TYPE_PL2303   = 5;

    private Thread readThread = null;
    private volatile boolean isRunning = false;
    private final ExecutorService writeExecutor = Executors.newSingleThreadExecutor();

    private final BroadcastReceiver usbReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            String action = intent.getAction();
            if (ACTION_USB_PERMISSION.equals(action)) {
                synchronized (this) {
                    UsbDevice device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
                    if (intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)) {
                        if (device != null) {
                            Log.d(TAG, "USB Permission granted for: " + device.getDeviceName());
                            openDevice(device, currentBaudRate);
                        }
                    } else {
                        Log.w(TAG, "USB Permission denied for device");
                        if (listener != null) {
                            listener.onError("Permissão USB negada pelo usuário");
                            listener.onStatus("DISCONNECTED", "Permissão USB negada");
                        }
                    }
                }
            } else if (UsbManager.ACTION_USB_DEVICE_ATTACHED.equals(action)) {
                UsbDevice device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
                if (device != null && listener != null) {
                    listener.onDeviceAttached(getFriendlyDeviceName(device));
                }
            } else if (UsbManager.ACTION_USB_DEVICE_DETACHED.equals(action)) {
                UsbDevice device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
                if (device != null) {
                    if (connectedDevice != null && device.getDeviceId() == connectedDevice.getDeviceId()) {
                        disconnect();
                    }
                    if (listener != null) {
                        listener.onDeviceDetached(getFriendlyDeviceName(device));
                    }
                }
            }
        }
    };

    public UsbSerialController(MainActivity activity, Listener listener) {
        this.activity = activity;
        this.listener = listener;
        this.usbManager = (UsbManager) activity.getSystemService(Context.USB_SERVICE);

        IntentFilter filter = new IntentFilter();
        filter.addAction(ACTION_USB_PERMISSION);
        filter.addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED);
        filter.addAction(UsbManager.ACTION_USB_DEVICE_DETACHED);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            activity.registerReceiver(usbReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            activity.registerReceiver(usbReceiver, filter);
        }
    }

    public void unregister() {
        try {
            activity.unregisterReceiver(usbReceiver);
        } catch (Exception ignored) {}
    }

    public String getConnectedDevicesJson() {
        if (usbManager == null) return "[]";
        HashMap<String, UsbDevice> deviceList = usbManager.getDeviceList();
        JSONArray arr = new JSONArray();

        for (UsbDevice dev : deviceList.values()) {
            try {
                JSONObject obj = new JSONObject();
                obj.put("deviceId", dev.getDeviceId());
                obj.put("deviceName", dev.getDeviceName());
                obj.put("vendorId", dev.getVendorId());
                obj.put("productId", dev.getProductId());
                obj.put("friendlyName", getFriendlyDeviceName(dev));
                obj.put("hasPermission", usbManager.hasPermission(dev));
                arr.put(obj);
            } catch (Exception ignored) {}
        }
        return arr.toString();
    }

    public static String getFriendlyDeviceName(UsbDevice dev) {
        int vid = dev.getVendorId();
        int pid = dev.getProductId();

        // CP210x - Silicon Labs (SiK Telemetry Radios, ESP32, ELRS)
        if (vid == 0x10C4) {
            return "Silicon Labs CP210x (Rádio SiK / ESP32 / ELRS) [" + dev.getDeviceId() + "]";
        }
        // WCH CH340 / CH341 (Arduino clones, ELRS, RadioMaster)
        if (vid == 0x1A86) {
            return "WCH CH340 USB-Serial (ELRS / Rádio / Arduino) [" + dev.getDeviceId() + "]";
        }
        // FTDI (Holybro SiK Radio, XBee, FT232R)
        if (vid == 0x0403) {
            return "FTDI USB-UART (Holybro SiK / Telemetria) [" + dev.getDeviceId() + "]";
        }
        // Prolific PL2303
        if (vid == 0x067B) {
            return "Prolific PL2303 USB-Serial [" + dev.getDeviceId() + "]";
        }
        // STM32 / Pixhawk / Betaflight / INAV CDC-ACM Virtual COM Port
        if (vid == 0x0483 || vid == 0x2DAE || vid == 0x1209 || dev.getDeviceClass() == UsbConstants.USB_CLASS_COMM) {
            return "Controladora de Voo CDC-ACM (Pixhawk / SpeedyBee / Matek) [" + dev.getDeviceId() + "]";
        }
        // Arduino ATmega16U2 CDC-ACM
        if (vid == 0x2341) {
            return "Arduino USB CDC Serial [" + dev.getDeviceId() + "]";
        }
        // Raspberry Pi Pico RP2040 VCP
        if (vid == 0x2E8A) {
            return "Raspberry Pi Pico RP2040 VCP [" + dev.getDeviceId() + "]";
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            String prod = dev.getProductName();
            if (prod != null && !prod.isEmpty()) {
                return prod + " [" + dev.getDeviceId() + "]";
            }
        }
        return String.format(java.util.Locale.US, "Dispositivo USB (VID:0x%04X PID:0x%04X) [%d]", vid, pid, dev.getDeviceId());
    }

    public void connect(int deviceId, int baudRate) {
        if (usbManager == null) {
            if (listener != null) listener.onError("USB Host não suportado neste aparelho");
            return;
        }

        UsbDevice targetDevice = null;
        for (UsbDevice dev : usbManager.getDeviceList().values()) {
            if (dev.getDeviceId() == deviceId) {
                targetDevice = dev;
                break;
            }
        }

        if (targetDevice == null) {
            // Se não encontrou pelo ID exato, tenta o primeiro disponível
            if (!usbManager.getDeviceList().isEmpty()) {
                targetDevice = usbManager.getDeviceList().values().iterator().next();
            }
        }

        if (targetDevice == null) {
            if (listener != null) {
                listener.onError("Nenhum adaptador de rádio USB ou dispositivo OTG conectado.");
                listener.onStatus("DISCONNECTED", "Nenhum dispositivo USB detectado");
            }
            return;
        }

        this.currentBaudRate = baudRate > 0 ? baudRate : 115200;

        if (!usbManager.hasPermission(targetDevice)) {
            Log.d(TAG, "Solicitando permissão USB para " + targetDevice.getDeviceName());
            if (listener != null) listener.onStatus("CONNECTING", "Solicitando permissão USB no Android...");
            
            int flags = 0;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                flags |= PendingIntent.FLAG_IMMUTABLE;
            }
            PendingIntent pi = PendingIntent.getBroadcast(activity, 0, new Intent(ACTION_USB_PERMISSION), flags);
            usbManager.requestPermission(targetDevice, pi);
        } else {
            openDevice(targetDevice, currentBaudRate);
        }
    }

    private void openDevice(UsbDevice device, int baudRate) {
        disconnect();

        UsbDeviceConnection conn = usbManager.openDevice(device);
        if (conn == null) {
            if (listener != null) {
                listener.onError("Falha ao abrir conexão USB com o dispositivo");
                listener.onStatus("DISCONNECTED", "Erro ao abrir porta USB");
            }
            return;
        }

        this.connectedDevice = device;
        this.connection = conn;
        this.deviceType = detectDeviceType(device);

        // Find interfaces & endpoints
        boolean interfaceClaimed = false;
        UsbEndpoint inEp = null;
        UsbEndpoint outEp = null;

        for (int i = 0; i < device.getInterfaceCount(); i++) {
            UsbInterface iface = device.getInterface(i);
            UsbEndpoint epInCandidate = null;
            UsbEndpoint epOutCandidate = null;

            for (int e = 0; e < iface.getEndpointCount(); e++) {
                UsbEndpoint ep = iface.getEndpoint(e);
                if (ep.getType() == UsbConstants.USB_ENDPOINT_XFER_BULK) {
                    if (ep.getDirection() == UsbConstants.USB_DIR_IN) {
                        epInCandidate = ep;
                    } else if (ep.getDirection() == UsbConstants.USB_DIR_OUT) {
                        epOutCandidate = ep;
                    }
                }
            }

            if (epInCandidate != null && epOutCandidate != null) {
                if (conn.claimInterface(iface, true)) {
                    this.claimedInterface = iface;
                    inEp = epInCandidate;
                    outEp = epOutCandidate;
                    interfaceClaimed = true;
                    break;
                }
            }
        }

        // Se CDC-ACM tiver endpoints em interfaces separadas (Data Interface)
        if (!interfaceClaimed && device.getInterfaceCount() > 1) {
            for (int i = 0; i < device.getInterfaceCount(); i++) {
                UsbInterface iface = device.getInterface(i);
                conn.claimInterface(iface, true);
                for (int e = 0; e < iface.getEndpointCount(); e++) {
                    UsbEndpoint ep = iface.getEndpoint(e);
                    if (ep.getType() == UsbConstants.USB_ENDPOINT_XFER_BULK) {
                        if (ep.getDirection() == UsbConstants.USB_DIR_IN && inEp == null) {
                            inEp = ep;
                        } else if (ep.getDirection() == UsbConstants.USB_DIR_OUT && outEp == null) {
                            outEp = ep;
                        }
                    }
                }
            }
            if (inEp != null && outEp != null) {
                interfaceClaimed = true;
            }
        }

        if (!interfaceClaimed || inEp == null || outEp == null) {
            conn.close();
            this.connection = null;
            if (listener != null) {
                listener.onError("Interface serial de dados não encontrada no dispositivo USB");
                listener.onStatus("DISCONNECTED", "Endpoints serial ausentes");
            }
            return;
        }

        this.endpointIn = inEp;
        this.endpointOut = outEp;

        // Initialize UART baud rate and flow control on the chipset
        try {
            configureUart(baudRate);
        } catch (Exception e) {
            Log.e(TAG, "Erro configurando UART", e);
        }

        this.isRunning = true;
        startReadLoop();

        String friendly = getFriendlyDeviceName(device);
        Log.i(TAG, "Conectado com sucesso via USB-OTG: " + friendly + " @ " + baudRate + " baud");
        if (listener != null) {
            listener.onStatus("CONNECTED", "USB OTG: " + friendly + " (" + baudRate + " baud)");
        }
    }

    private int detectDeviceType(UsbDevice device) {
        int vid = device.getVendorId();
        if (vid == 0x10C4) return TYPE_CP210X;
        if (vid == 0x1A86) return TYPE_CH340;
        if (vid == 0x0403) return TYPE_FTDI;
        if (vid == 0x067B) return TYPE_PL2303;
        return TYPE_CDC_ACM; // Padrão CDC-ACM (Pixhawk, STM32, Arduino, Pico)
    }

    private void configureUart(int baudRate) {
        if (connection == null) return;

        switch (deviceType) {
            case TYPE_CP210X:
                // Silicon Labs CP2102 / CP2104 (SiK Radios, ESP32, ELRS)
                // IFC_ENABLE = 0x00, wValue = 0x01
                connection.controlTransfer(0x41, 0x00, 0x01, 0, null, 0, 1000);
                // SET_BAUD_DIV = 0x01 or SET_BAUDRATE = 0x1E
                byte[] baudBytes = new byte[] {
                    (byte) (baudRate & 0xFF),
                    (byte) ((baudRate >> 8) & 0xFF),
                    (byte) ((baudRate >> 16) & 0xFF),
                    (byte) ((baudRate >> 24) & 0xFF)
                };
                connection.controlTransfer(0x41, 0x1E, 0, 0, baudBytes, 4, 1000);
                // SET_LINE_CTL = 0x03 (8 data bits, 1 stop bit, no parity: 0x0800)
                connection.controlTransfer(0x41, 0x03, 0x0800, 0, null, 0, 1000);
                // SET_MHS = 0x07 (DTR=1, RTS=1: 0x0303)
                connection.controlTransfer(0x41, 0x07, 0x0303, 0, null, 0, 1000);
                break;

            case TYPE_CH340:
                // WCH CH340 / CH341 (ELRS, RadioMaster, Arduino clones)
                connection.controlTransfer(0x40, 0xA1, 0xC29C, 0xB2B9, null, 0, 1000);
                int factor, divisor;
                switch (baudRate) {
                    case 9600: factor = 0xB2; divisor = 0x13; break;
                    case 19200: factor = 0xD9; divisor = 0x13; break;
                    case 38400: factor = 0x64; divisor = 0x13; break;
                    case 57600: factor = 0x98; divisor = 0x13; break;
                    case 115200: factor = 0xCC; divisor = 0x13; break;
                    case 230400: factor = 0xE6; divisor = 0x13; break;
                    case 460800: factor = 0xF3; divisor = 0x13; break;
                    case 921600: factor = 0xF7; divisor = 0x13; break;
                    default: factor = 0xCC; divisor = 0x13; break;
                }
                connection.controlTransfer(0x40, 0x9A, 0x1312, (factor << 8) | divisor, null, 0, 1000);
                connection.controlTransfer(0x40, 0x9A, 0x0F2C, 0x0000, null, 0, 1000);
                connection.controlTransfer(0x40, 0xA4, ~((1 << 5) | (1 << 6)), 0, null, 0, 1000);
                break;

            case TYPE_FTDI:
                // FTDI FT232R (Holybro SiK Radios, XBee)
                connection.controlTransfer(0x40, 0x00, 0x00, 1, null, 0, 1000); // Reset
                int baudDivisor = 3000000 / (baudRate > 0 ? baudRate : 115200);
                connection.controlTransfer(0x40, 0x03, baudDivisor, 1, null, 0, 1000); // Baud
                connection.controlTransfer(0x40, 0x04, 0x0008, 1, null, 0, 1000); // 8N1
                connection.controlTransfer(0x40, 0x01, 0x0303, 1, null, 0, 1000); // DTR/RTS
                break;

            case TYPE_CDC_ACM:
            default:
                // Standard USB CDC-ACM (Pixhawk, STM32 VCP, Arduino Uno ATmega16U2, Pico RP2040)
                byte[] lineCoding = new byte[7];
                lineCoding[0] = (byte) (baudRate & 0xFF);
                lineCoding[1] = (byte) ((baudRate >> 8) & 0xFF);
                lineCoding[2] = (byte) ((baudRate >> 16) & 0xFF);
                lineCoding[3] = (byte) ((baudRate >> 24) & 0xFF);
                lineCoding[4] = 0; // 1 stop bit
                lineCoding[5] = 0; // parity: none
                lineCoding[6] = 8; // 8 data bits
                // SET_LINE_CODING = 0x20
                connection.controlTransfer(0x21, 0x20, 0, 0, lineCoding, 7, 1000);
                // SET_CONTROL_LINE_STATE = 0x22 (DTR + RTS = 0x03)
                connection.controlTransfer(0x21, 0x22, 0x03, 0, null, 0, 1000);
                break;
        }
    }

    private void startReadLoop() {
        readThread = new Thread(() -> {
            byte[] buffer = new byte[2048];
            while (isRunning && connection != null && endpointIn != null) {
                int bytesRead = connection.bulkTransfer(endpointIn, buffer, buffer.length, 100);
                if (bytesRead > 0) {
                    // For FTDI, first 2 bytes are modem status
                    int offset = 0;
                    int length = bytesRead;
                    if (deviceType == TYPE_FTDI && bytesRead > 2) {
                        offset = 2;
                        length -= 2;
                    }
                    if (length > 0) {
                        String data = new String(buffer, offset, length, StandardCharsets.UTF_8);
                        if (listener != null) {
                            listener.onData(data);
                        }
                    }
                }
            }
        }, "UsbSerialReadThread");
        readThread.setPriority(Thread.MAX_PRIORITY);
        readThread.start();
    }

    public void sendData(byte[] data) {
        if (!isRunning || connection == null || endpointOut == null || data == null || data.length == 0) return;

        writeExecutor.execute(() -> {
            try {
                int offset = 0;
                int remaining = data.length;
                int maxPacketSize = endpointOut.getMaxPacketSize();
                int chunkSize = maxPacketSize > 0 ? Math.min(maxPacketSize, 256) : 64;

                while (remaining > 0 && isRunning && connection != null) {
                    int toSend = Math.min(remaining, chunkSize);
                    byte[] chunk = new byte[toSend];
                    System.arraycopy(data, offset, chunk, 0, toSend);
                    
                    int sent = connection.bulkTransfer(endpointOut, chunk, toSend, 200);
                    if (sent < 0) {
                        Log.w(TAG, "Falha no envio bulk transfer USB");
                        break;
                    }
                    offset += toSend;
                    remaining -= toSend;
                }
            } catch (Exception e) {
                Log.e(TAG, "Erro transmitindo pacote USB", e);
            }
        });
    }

    public void disconnect() {
        isRunning = false;
        if (readThread != null) {
            readThread.interrupt();
            readThread = null;
        }

        if (connection != null) {
            try {
                if (claimedInterface != null) {
                    connection.releaseInterface(claimedInterface);
                    claimedInterface = null;
                }
                connection.close();
            } catch (Exception ignored) {}
            connection = null;
        }

        connectedDevice = null;
        endpointIn = null;
        endpointOut = null;
    }

    public boolean isConnected() {
        return isRunning && connection != null;
    }
}
