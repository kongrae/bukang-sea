package kr.hongrae.sharksos;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import com.android.installreferrer.api.InstallReferrerClient;
import com.android.installreferrer.api.InstallReferrerStateListener;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * LaunchPad(apptesters.cc) closed-test install verification, ported from their Kotlin guide
 * (https://apptesters.cc/guide/install-detection).
 *
 * Reads the Play Install Referrer once. Only when the app was installed through a LaunchPad exchange link
 * (referrer "utm_source=launchpad&app_id=...&exchange_id=...") the referrer string is POSTed to LaunchPad so the
 * tester is marked as installed. Normal installs send nothing, which is what assets/privacy.html and the Play data
 * safety declaration describe. The check is retried on later launches only while the upload has not succeeded.
 */
final class Launchpad {
    private static final String TAG = "Launchpad";
    private static final String PREFS = "launchpad";
    private static final String KEY_DONE = "referrerChecked";
    private static final String ENDPOINT = "https://apptesters.cc/api/verify-install";
    private static final int TIMEOUT_MS = 10000;

    private Launchpad() {}

    /** Call once from MainActivity.onCreate. Never blocks the UI thread. */
    static void verifyInstall(Context context) {
        final Context app = context.getApplicationContext();
        final SharedPreferences prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (prefs.getBoolean(KEY_DONE, false)) return;
        final InstallReferrerClient client = InstallReferrerClient.newBuilder(app).build();
        try {
            client.startConnection(new InstallReferrerStateListener() {
                @Override
                public void onInstallReferrerSetupFinished(int code) {
                    try {
                        if (code == InstallReferrerClient.InstallReferrerResponse.OK) {
                            String referrer = client.getInstallReferrer().getInstallReferrer();
                            if (referrer != null && referrer.contains("launchpad")) {
                                send(referrer, prefs);
                            } else {
                                prefs.edit().putBoolean(KEY_DONE, true).apply();   // not a LaunchPad install: nothing to send, ever
                            }
                        } else if (code == InstallReferrerClient.InstallReferrerResponse.FEATURE_NOT_SUPPORTED
                                || code == InstallReferrerClient.InstallReferrerResponse.DEVELOPER_ERROR) {
                            prefs.edit().putBoolean(KEY_DONE, true).apply();   // no Play referrer on this device
                        }
                    } catch (Exception e) {
                        Log.w(TAG, "install referrer unavailable", e);
                    } finally {
                        client.endConnection();
                    }
                }

                @Override
                public void onInstallReferrerServiceDisconnected() {}
            });
        } catch (RuntimeException e) {
            Log.w(TAG, "install referrer connection failed", e);
        }
    }

    private static void send(final String referrer, final SharedPreferences prefs) {
        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                byte[] body = new JSONObject().put("installReferrer", referrer).toString().getBytes(StandardCharsets.UTF_8);
                conn = (HttpURLConnection) new URL(ENDPOINT).openConnection();
                conn.setConnectTimeout(TIMEOUT_MS);
                conn.setReadTimeout(TIMEOUT_MS);
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setDoOutput(true);
                try (OutputStream out = conn.getOutputStream()) { out.write(body); }
                int status = conn.getResponseCode();
                if (status >= 200 && status < 300) prefs.edit().putBoolean(KEY_DONE, true).apply();
                Log.i(TAG, "verify-install " + status);
            } catch (Exception e) {
                Log.w(TAG, "verify-install failed, will retry on next launch", e);
            } finally {
                if (conn != null) conn.disconnect();
            }
        }, "launchpad-verify").start();
    }
}
