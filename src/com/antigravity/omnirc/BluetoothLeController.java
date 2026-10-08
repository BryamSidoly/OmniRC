package com.antigravity.omnirc;

import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanResult;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class BluetoothLeController {
    private static final String TAG = "OmniRC_BLE";

    // Standard Nordic UART Service UUIDs
    public static final UUID NORDIC_UART_SERVICE = UUID.fromString("6E400001-B5A3-F393-E0A9-E50E24DCCA9E");
    public static final UUID NORDIC_UART_TX = UUID.fromString("6E400002-B5A3-F393-E0A9-E50E24DCCA9E"); // Write
    public static final UUID NORDIC_UART_RX = UUID.fromString("6E400003-B5A3-F393-E0A9-E50E24DCCA9E"); // Notify

    // Common HM-10 / CC2541 Service UUIDs
    public static final UUID HM10_SERVICE = UUID.fromString("0000FFE0-0000-1000-8000-00805F9B34FB");
    public static final UUID HM10_CHAR = UUID.fromString("0000FFE1-0000-1000-8000-00805F9B34FB");

    private static final UUID CLIENT_CHARACTERISTIC_CONFIG = UUID.fromString("00002902-0000-1000-8000-00805F9B34FB");

    public interface Listener {
        void onStatus(String status, String details);
        void onData(String data);
        void onError(String error);
        void onDeviceFound(String name, String address, int rssi);
    }

    private final Context context;
    private final Listener listener;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    private BluetoothAdapter bluetoothAdapter;
    private BluetoothLeScanner bleScanner;
    private BluetoothGatt bluetoothGatt;
    private BluetoothGattCharacteristic writeCharacteristic;

    private volatile boolean isConnected = false;
    private volatile boolean isScanning = false;
    private int mtuSize = 20;

    private final ScanCallback scanCallback = new ScanCallback() {
        @Override
        public void onScanResult(int callbackType, ScanResult result) {
            BluetoothDevice dev = result.getDevice();
            if (dev != null) {
                try {
                    String name = dev.getName();
                    String addr = dev.getAddress();
                    int rssi = result.getRssi();
                    mainHandler.post(() -> listener.onDeviceFound(name != null ? name : "BLE Device", addr, rssi));
                } catch (SecurityException ignored) {}
            }
        }
    };

    public BluetoothLeController(Context context, Listener listener) {
        this.context = context;
        this.listener = listener;
        try {
            this.bluetoothAdapter = BluetoothAdapter.getDefaultAdapter();
            if (bluetoothAdapter != null) {
                this.bleScanner = bluetoothAdapter.getBluetoothLeScanner();
            }
        } catch (Exception e) {
            Log.e(TAG, "BLE initialization error", e);
        }
    }

    public void startScan() {
        if (bleScanner == null) {
            if (bluetoothAdapter != null) {
                bleScanner = bluetoothAdapter.getBluetoothLeScanner();
            }
        }
        if (bleScanner == null) {
            postError("BLE Scanner unavailable");
            return;
        }

        try {
            isScanning = true;
            bleScanner.startScan(scanCallback);
            postStatus("SCANNING", "Scanning for BLE devices...");
            // Stop after 10 seconds automatically
            mainHandler.postDelayed(this::stopScan, 10000);
        } catch (SecurityException e) {
            postError("BLE Scan permission denied");
        }
    }

    public void stopScan() {
        if (bleScanner != null && isScanning) {
            try {
                bleScanner.stopScan(scanCallback);
            } catch (Exception ignored) {}
            isScanning = false;
        }
    }

    public synchronized void connect(String address) {
        disconnect();
        if (bluetoothAdapter == null) {
            postError("Bluetooth not available");
            return;
        }

        postStatus("CONNECTING", "BLE connecting to " + address);

        try {
            BluetoothDevice device = bluetoothAdapter.getRemoteDevice(address);
            bluetoothGatt = device.connectGatt(context, false, gattCallback);
        } catch (SecurityException e) {
            postError("BLE Connect permission denied");
        } catch (Exception e) {
            postError("BLE Connect error: " + e.getMessage());
        }
    }

    private final BluetoothGattCallback gattCallback = new BluetoothGattCallback() {
        @Override
        public void onConnectionStateChange(BluetoothGatt gatt, int status, int newState) {
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                isConnected = true;
                postStatus("CONNECTED", "BLE Connected. Negotiating MTU...");
                try {
                    gatt.requestMtu(512);
                } catch (SecurityException ignored) {}
                try {
                    gatt.discoverServices();
                } catch (SecurityException ignored) {}
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                isConnected = false;
                writeCharacteristic = null;
                postStatus("DISCONNECTED", "BLE Disconnected");
            }
        }

        @Override
        public void onMtuChanged(BluetoothGatt gatt, int mtu, int status) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                mtuSize = Math.max(20, mtu - 3);
                Log.d(TAG, "BLE MTU set to " + mtuSize);
            }
        }

        @Override
        public void onServicesDiscovered(BluetoothGatt gatt, int status) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                findUartCharacteristics(gatt);
            }
        }

        @Override
        public void onCharacteristicChanged(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic) {
            byte[] val = characteristic.getValue();
            if (val != null) {
                String str = new String(val, StandardCharsets.UTF_8);
                postData(str);
            }
        }
    };

    private void findUartCharacteristics(BluetoothGatt gatt) {
        // Check Nordic UART
        BluetoothGattService service = gatt.getService(NORDIC_UART_SERVICE);
        if (service != null) {
            writeCharacteristic = service.getCharacteristic(NORDIC_UART_TX);
            BluetoothGattCharacteristic rx = service.getCharacteristic(NORDIC_UART_RX);
            enableNotifications(gatt, rx);
            postStatus("CONNECTED", "Nordic UART Ready");
            return;
        }

        // Check HM-10
        service = gatt.getService(HM10_SERVICE);
        if (service != null) {
            writeCharacteristic = service.getCharacteristic(HM10_CHAR);
            enableNotifications(gatt, writeCharacteristic);
            postStatus("CONNECTED", "HM-10 UART Ready");
            return;
        }

        // Look for any writable and notifiable characteristic
        for (BluetoothGattService s : gatt.getServices()) {
            for (BluetoothGattCharacteristic c : s.getCharacteristics()) {
                int props = c.getProperties();
                if ((props & BluetoothGattCharacteristic.PROPERTY_WRITE) != 0 ||
                    (props & BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0) {
                    if (writeCharacteristic == null) {
                        writeCharacteristic = c;
                    }
                }
                if ((props & BluetoothGattCharacteristic.PROPERTY_NOTIFY) != 0) {
                    enableNotifications(gatt, c);
                }
            }
        }

        if (writeCharacteristic != null) {
            postStatus("CONNECTED", "BLE Generic UART Ready");
        } else {
            postError("No writable UART characteristic found");
        }
    }

    private void enableNotifications(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic) {
        if (characteristic == null) return;
        try {
            gatt.setCharacteristicNotification(characteristic, true);
            BluetoothGattDescriptor descriptor = characteristic.getDescriptor(CLIENT_CHARACTERISTIC_CONFIG);
            if (descriptor != null) {
                descriptor.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
                gatt.writeDescriptor(descriptor);
            }
        } catch (SecurityException ignored) {}
    }

    public void sendData(byte[] data) {
        if (!isConnected || bluetoothGatt == null || writeCharacteristic == null) return;
        executor.execute(() -> {
            try {
                // Chunk data according to MTU
                int offset = 0;
                while (offset < data.length) {
                    int len = Math.min(mtuSize, data.length - offset);
                    byte[] chunk = Arrays.copyOfRange(data, offset, offset + len);
                    writeCharacteristic.setValue(chunk);
                    writeCharacteristic.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE);
                    bluetoothGatt.writeCharacteristic(writeCharacteristic);
                    offset += len;
                    if (offset < data.length) {
                        Thread.sleep(15);
                    }
                }
            } catch (Exception e) {
                Log.e(TAG, "BLE send error", e);
            }
        });
    }

    public synchronized void disconnect() {
        stopScan();
        isConnected = false;
        if (bluetoothGatt != null) {
            try {
                bluetoothGatt.disconnect();
                bluetoothGatt.close();
            } catch (Exception ignored) {}
            bluetoothGatt = null;
        }
        writeCharacteristic = null;
        postStatus("DISCONNECTED", "BLE disconnected");
    }

    public boolean isConnected() {
        return isConnected;
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
