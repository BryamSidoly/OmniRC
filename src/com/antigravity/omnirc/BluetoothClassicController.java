package com.antigravity.omnirc;

import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class BluetoothClassicController {
    private static final String TAG = "OmniRC_BT";
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

    public interface Listener {
        void onStatus(String status, String details);
        void onData(String data);
        void onError(String error);
        void onDeviceFound(String name, String address);
    }

    private final Context context;
    private final Listener listener;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final ExecutorService executor = Executors.newCachedThreadPool();

    private BluetoothAdapter bluetoothAdapter;
    private BluetoothSocket bluetoothSocket;
    private OutputStream outStream;
    private InputStream inStream;
    private Thread readThread;
    private volatile boolean isConnected = false;
    private boolean isReceiverRegistered = false;

    private final BroadcastReceiver discoveryReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            String action = intent.getAction();
            if (BluetoothDevice.ACTION_FOUND.equals(action)) {
                BluetoothDevice device = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
                if (device != null) {
                    try {
                        String name = device.getName();
                        String addr = device.getAddress();
                        mainHandler.post(() -> listener.onDeviceFound(name != null ? name : "Unknown", addr));
                    } catch (SecurityException ignored) {}
                }
            }
        }
    };

    public BluetoothClassicController(Context context, Listener listener) {
        this.context = context;
        this.listener = listener;
        try {
            this.bluetoothAdapter = BluetoothAdapter.getDefaultAdapter();
        } catch (Exception e) {
            Log.e(TAG, "Bluetooth not supported on this device", e);
        }
    }

    public List<String> getPairedDevices() {
        List<String> list = new ArrayList<>();
        if (bluetoothAdapter == null) return list;
        try {
            Set<BluetoothDevice> paired = bluetoothAdapter.getBondedDevices();
            if (paired != null) {
                for (BluetoothDevice device : paired) {
                    list.add(device.getName() + " [" + device.getAddress() + "]");
                }
            }
        } catch (SecurityException e) {
            Log.e(TAG, "Permission missing for bonded devices", e);
        }
        return list;
    }

    public void startDiscovery() {
        if (bluetoothAdapter == null) return;
        try {
            if (!isReceiverRegistered) {
                IntentFilter filter = new IntentFilter(BluetoothDevice.ACTION_FOUND);
                context.registerReceiver(discoveryReceiver, filter);
                isReceiverRegistered = true;
            }
            if (bluetoothAdapter.isDiscovering()) {
                bluetoothAdapter.cancelDiscovery();
            }
            bluetoothAdapter.startDiscovery();
        } catch (SecurityException e) {
            postError("Bluetooth scan permission required");
        }
    }

    public void stopDiscovery() {
        if (bluetoothAdapter == null) return;
        try {
            if (bluetoothAdapter.isDiscovering()) {
                bluetoothAdapter.cancelDiscovery();
            }
            if (isReceiverRegistered) {
                context.unregisterReceiver(discoveryReceiver);
                isReceiverRegistered = false;
            }
        } catch (Exception ignored) {}
    }

    public synchronized void connect(String address) {
        disconnect();
        if (bluetoothAdapter == null) {
            postError("Bluetooth adapter not available");
            return;
        }

        postStatus("CONNECTING", "Bluetooth connecting to " + address);

        executor.execute(() -> {
            try {
                if (bluetoothAdapter.isDiscovering()) {
                    bluetoothAdapter.cancelDiscovery();
                }
                BluetoothDevice device = bluetoothAdapter.getRemoteDevice(address);

                BluetoothSocket socket = null;
                try {
                    socket = device.createRfcommSocketToServiceRecord(SPP_UUID);
                    socket.connect();
                } catch (Exception e1) {
                    Log.w(TAG, "Standard SPP failed, trying reflection fallback...", e1);
                    // Fallback using reflection for older/custom stacks
                    try {
                        socket = (BluetoothSocket) device.getClass()
                                .getMethod("createRfcommSocket", new Class[]{int.class})
                                .invoke(device, 1);
                        socket.connect();
                    } catch (Exception e2) {
                        Log.e(TAG, "Fallback RFCOMM also failed", e2);
                        throw e1;
                    }
                }

                bluetoothSocket = socket;
                outStream = socket.getOutputStream();
                inStream = socket.getInputStream();
                isConnected = true;

                postStatus("CONNECTED", "BT Connected: " + device.getName());

                readThread = new Thread(() -> {
                    byte[] buffer = new byte[1024];
                    while (isConnected && inStream != null) {
                        try {
                            int bytes = inStream.read(buffer);
                            if (bytes > 0) {
                                String text = new String(buffer, 0, bytes, StandardCharsets.UTF_8);
                                postData(text);
                            }
                        } catch (Exception e) {
                            if (isConnected) {
                                Log.w(TAG, "BT stream disconnected", e);
                                postStatus("DISCONNECTED", "Bluetooth connection lost");
                            }
                            break;
                        }
                    }
                    isConnected = false;
                });
                readThread.start();

            } catch (Exception e) {
                Log.e(TAG, "Bluetooth connect failed", e);
                isConnected = false;
                postError("BT connect error: " + e.getMessage());
                postStatus("DISCONNECTED", "BT connection failed");
            }
        });
    }

    public void sendData(byte[] data) {
        if (!isConnected || outStream == null) return;
        executor.execute(() -> {
            try {
                outStream.write(data);
                outStream.flush();
            } catch (Exception e) {
                Log.e(TAG, "BT send error", e);
                postError("BT send failed: " + e.getMessage());
            }
        });
    }

    public synchronized void disconnect() {
        stopDiscovery();
        isConnected = false;
        if (bluetoothSocket != null) {
            try {
                bluetoothSocket.close();
            } catch (Exception ignored) {}
            bluetoothSocket = null;
        }
        outStream = null;
        inStream = null;
        postStatus("DISCONNECTED", "Bluetooth disconnected");
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
