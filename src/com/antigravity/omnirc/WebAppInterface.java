package com.antigravity.omnirc;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.util.List;

public class WebAppInterface {
    private final MainActivity activity;
    private final WebView webView;
    private final SharedPreferences prefs;

    private final NetworkController networkController;
    private final BluetoothClassicController btClassicController;
    private final BluetoothLeController btLeController;

    private String currentTransport = "NONE"; // "WIFI_UDP", "WIFI_TCP", "BT_CLASSIC", "BT_BLE"

    public WebAppInterface(MainActivity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
        this.prefs = activity.getSharedPreferences("OmniRC_Config", Context.MODE_PRIVATE);

        // Network callbacks
        this.networkController = new NetworkController(new NetworkController.Listener() {
            @Override
            public void onStatus(String status, String details) {
                dispatchJs("window.onNativeStatus('" + escapeJs(status) + "', '" + escapeJs(details) + "')");
            }

            @Override
            public void onData(String data) {
                dispatchJs("window.onNativeData('" + escapeJs(data) + "')");
            }

            @Override
            public void onError(String error) {
                dispatchJs("window.onNativeError('" + escapeJs(error) + "')");
            }
        });

        // Bluetooth Classic callbacks
        this.btClassicController = new BluetoothClassicController(activity, new BluetoothClassicController.Listener() {
            @Override
            public void onStatus(String status, String details) {
                dispatchJs("window.onNativeStatus('" + escapeJs(status) + "', '" + escapeJs(details) + "')");
            }

            @Override
            public void onData(String data) {
                dispatchJs("window.onNativeData('" + escapeJs(data) + "')");
            }

            @Override
            public void onError(String error) {
                dispatchJs("window.onNativeError('" + escapeJs(error) + "')");
            }

            @Override
            public void onDeviceFound(String name, String address) {
                dispatchJs("window.onNativeDeviceFound('" + escapeJs(name) + "', '" + escapeJs(address) + "', 'CLASSIC', 0)");
            }
        });

        // Bluetooth LE callbacks
        this.btLeController = new BluetoothLeController(activity, new BluetoothLeController.Listener() {
            @Override
            public void onStatus(String status, String details) {
                dispatchJs("window.onNativeStatus('" + escapeJs(status) + "', '" + escapeJs(details) + "')");
            }

            @Override
            public void onData(String data) {
                dispatchJs("window.onNativeData('" + escapeJs(data) + "')");
            }

            @Override
            public void onError(String error) {
                dispatchJs("window.onNativeError('" + escapeJs(error) + "')");
            }

            @Override
            public void onDeviceFound(String name, String address, int rssi) {
                dispatchJs("window.onNativeDeviceFound('" + escapeJs(name) + "', '" + escapeJs(address) + "', 'BLE', " + rssi + ")");
            }
        });
    }

    @JavascriptInterface
    public void connectWifi(String mode, String host, int port) {
        disconnectAll();
        if ("UDP".equalsIgnoreCase(mode)) {
            currentTransport = "WIFI_UDP";
            networkController.startUdp(host, port);
        } else if ("TCP".equalsIgnoreCase(mode)) {
            currentTransport = "WIFI_TCP";
            networkController.startTcp(host, port);
        }
    }

    @JavascriptInterface
    public void connectBluetooth(String type, String address) {
        disconnectAll();
        if ("BLE".equalsIgnoreCase(type)) {
            currentTransport = "BT_BLE";
            btLeController.connect(address);
        } else {
            currentTransport = "BT_CLASSIC";
            btClassicController.connect(address);
        }
    }

    @JavascriptInterface
    public void disconnect() {
        disconnectAll();
    }

    private void disconnectAll() {
        networkController.disconnect();
        btClassicController.disconnect();
        btLeController.disconnect();
        currentTransport = "NONE";
        dispatchJs("window.onNativeStatus('DISCONNECTED', 'All disconnected')");
    }

    @JavascriptInterface
    public void sendPacket(String data, boolean isHex) {
        byte[] bytes;
        if (isHex) {
            bytes = parseHex(data);
        } else {
            bytes = data.getBytes(StandardCharsets.UTF_8);
        }

        if (bytes == null || bytes.length == 0) return;

        if (currentTransport.startsWith("WIFI_")) {
            networkController.sendData(bytes);
        } else if ("BT_CLASSIC".equals(currentTransport)) {
            btClassicController.sendData(bytes);
        } else if ("BT_BLE".equals(currentTransport)) {
            btLeController.sendData(bytes);
        }
    }

    @JavascriptInterface
    public void sendHttpRequest(String url, String method, String payload) {
        networkController.sendHttp(url, method, payload);
    }

    @JavascriptInterface
    public void scanBluetooth(String type) {
        activity.ensurePermissions();
        if ("BLE".equalsIgnoreCase(type)) {
            btLeController.startScan();
        } else {
            btClassicController.startDiscovery();
        }
    }

    @JavascriptInterface
    public void stopBluetoothScan() {
        btClassicController.stopDiscovery();
        btLeController.stopScan();
    }

    @JavascriptInterface
    public String getPairedDevicesJson() {
        activity.ensurePermissions();
        List<String> list = btClassicController.getPairedDevices();
        JSONArray arr = new JSONArray();
        try {
            for (String item : list) {
                int bracket = item.lastIndexOf('[');
                if (bracket != -1 && item.endsWith("]")) {
                    String name = item.substring(0, bracket).trim();
                    String addr = item.substring(bracket + 1, item.length() - 1).trim();
                    JSONObject obj = new JSONObject();
                    obj.put("name", name);
                    obj.put("address", addr);
                    arr.put(obj);
                }
            }
        } catch (Exception ignored) {}
        return arr.toString();
    }

    @JavascriptInterface
    public void vibrate(int milliseconds) {
        try {
            Vibrator v = (Vibrator) activity.getSystemService(Context.VIBRATOR_SERVICE);
            if (v != null && v.hasVibrator()) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    v.vibrate(VibrationEffect.createOneShot(milliseconds, VibrationEffect.DEFAULT_AMPLITUDE));
                } else {
                    v.vibrate(milliseconds);
                }
            }
        } catch (Exception ignored) {}
    }

    @JavascriptInterface
    public void saveConfig(String key, String value) {
        prefs.edit().putString(key, value).apply();
    }

    @JavascriptInterface
    public String loadConfig(String key, String defaultValue) {
        return prefs.getString(key, defaultValue);
    }

    @JavascriptInterface
    public void requestPermissions() {
        activity.ensurePermissions();
    }

    private byte[] parseHex(String hex) {
        try {
            String clean = hex.replaceAll("[^0-9a-fA-F]", "");
            int len = clean.length();
            byte[] data = new byte[len / 2];
            for (int i = 0; i < len; i += 2) {
                data[i / 2] = (byte) ((Character.digit(clean.charAt(i), 16) << 4)
                        + Character.digit(clean.charAt(i + 1), 16));
            }
            return data;
        } catch (Exception e) {
            return new byte[0];
        }
    }

    private void dispatchJs(String js) {
        activity.runOnUiThread(() -> {
            if (webView != null) {
                webView.evaluateJavascript(js, null);
            }
        });
    }

    private String escapeJs(String text) {
        if (text == null) return "";
        return text.replace("\\", "\\\\")
                   .replace("'", "\\'")
                   .replace("\n", "\\n")
                   .replace("\r", "\\r");
    }

    public void cleanup() {
        disconnectAll();
    }
}
