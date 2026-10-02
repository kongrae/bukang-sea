package kr.hongrae.sharksos;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
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
 * Once per installation (keyed by PackageInfo.firstInstallTime, so a restored Auto Backup of the preferences cannot
 * mask a fresh LaunchPad reinstall) the Play Install Referrer is read. Only when the app was installed through a
 * LaunchPad exchange link (referrer "utm_source=launchpad&app_id=...&exchange_id=...") the referrer string is POSTed
 * to LaunchPad so the tester is marked as installed. Normal installs send nothing, which is what assets/privacy.html
 * and the Play data safety declaration describe. A failed upload is retried on later launches at most MAX_ATTEMPTS
 * times; a 4xx answer is treated as final.
 */
final class Launchpad {
    private static final String TAG = "Launchpad";
    private static final String PREFS = "launchpad";
    private static final String KEY_HANDLED_INSTALL = "handledInstallTime";   // firstInstallTime already dealt with
    private static final String KEY_SENT_REFERRER = "sentReferrer";          // referrer accepted by LaunchPad
    private static final String KEY_ATTEMPTS = "attempts";
    private static final String ENDPOINT = "https://apptesters.cc/api/verify-install";
    private static final int TIMEOUT_MS = 10000;
    private static final int MAX_ATTEMPTS = 5;

    private Launchpad() {}

    /** Call once from MainActivity.onCreate. Never blocks the UI thread. */
    static void verifyInstall(Context context) {
        final Context app = context.getApplicationContext();
        final SharedPreferences prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        final long installTime = firstInstallTime(app);
        if (prefs.getLong(KEY_HANDLED_INSTALL, -1) == installTime) return;
        final InstallReferrerClient client = InstallReferrerClient.newBuilder(app).build();
        try {
            client.startConnection(new InstallReferrerStateListener() {
                @Override
                public void onInstallReferrerSetupFinished(int code) {
                    try {
                        if (code == InstallReferrerClient.InstallReferrerResponse.OK) {
                            String referrer = client.getInstallReferrer().getInstallReferrer();
                            boolean launchpad = referrer != null && referrer.contains("launchpad");
                            if (launchpad && !referrer.equals(prefs.getString(KEY_SENT_REFERRER, ""))) {
                                send(referrer, prefs, installTime);
                            } else {
                                markHandled(prefs, installTime);   // not a LaunchPad install, or already reported
                            }
                        } else if (code == InstallReferrerClient.InstallReferrerResponse.FEATURE_NOT_SUPPORTED
                                || code == InstallReferrerClient.InstallReferrerResponse.DEVELOPER_ERROR) {
                            markHandled(prefs, installTime);   // no Play referrer on this device, ever
                        }
                        // SERVICE_UNAVAILABLE etc.: try again on a later launch
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

    private static long firstInstallTime(Context app) {
        try {
            return app.getPackageManager().getPackageInfo(app.getPackageName(), 0).firstInstallTime;
        } catch (PackageManager.NameNotFoundException | RuntimeException e) {
            return 0L;
        }
    }

    private static void markHandled(SharedPreferences prefs, long installTime) {
        prefs.edit().putLong(KEY_HANDLED_INSTALL, installTime).remove(KEY_ATTEMPTS).apply();
    }

    private static void send(final String referrer, final SharedPreferences prefs, final long installTime) {
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
                Log.i(TAG, "verify-install " + status);
                if (status >= 200 && status < 300) {
                    prefs.edit().putString(KEY_SENT_REFERRER, referrer).apply();
                    markHandled(prefs, installTime);
                } else if (status >= 400 && status < 500) {
                    markHandled(prefs, installTime);   // LaunchPad rejected it for good; retrying cannot help
                } else {
                    countFailure(prefs, installTime);
                }
            } catch (Exception e) {
                Log.w(TAG, "verify-install failed", e);
                countFailure(prefs, installTime);
            } finally {
                if (conn != null) conn.disconnect();
            }
        }, "launchpad-verify").start();
    }

    private static void countFailure(SharedPreferences prefs, long installTime) {
        int attempts = prefs.getInt(KEY_ATTEMPTS, 0) + 1;
        if (attempts >= MAX_ATTEMPTS) markHandled(prefs, installTime);   // give up quietly after a few launches
        else prefs.edit().putInt(KEY_ATTEMPTS, attempts).apply();
    }
}
