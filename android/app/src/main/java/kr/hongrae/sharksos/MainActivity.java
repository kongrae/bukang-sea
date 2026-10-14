package kr.hongrae.sharksos;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebView;
import androidx.core.splashscreen.SplashScreen;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private final Handler launchHandler = new Handler(Looper.getMainLooper());

    @Override
    public void onCreate(Bundle savedInstanceState) {
        SplashScreen splash = SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);
        // Keep the system image until the web loading image is ready. Waiting for the web
        // animation frames here can stall on WebViews that throttle fully occluded content.
        splash.setOnExitAnimationListener(provider -> {
            final boolean[] dismissed = {false};
            Runnable dismiss = () -> {
                if (dismissed[0]) return;
                dismissed[0] = true;
                launchHandler.removeCallbacksAndMessages(null);
                provider.getView().animate().alpha(0f).setDuration(160)
                    .withEndAction(provider::remove).start();
            };
            // A stalled renderer must never leave a permanent system splash over an error page.
            launchHandler.postDelayed(dismiss, 6000);
            launchHandler.post(new Runnable() {
                @Override
                public void run() {
                    if (dismissed[0]) return;
                    WebView view = getBridge() == null ? null : getBridge().getWebView();
                    if (view == null) { dismiss.run(); return; }
                    view.evaluateJavascript("(function(){var app=document.getElementById('app');"
                        + "var retry=document.getElementById('launchRetry');"
                        + "var image=document.getElementById('launchShark');"
                        + "return !!((app&&!app.classList.contains('launching'))||(retry&&!retry.hidden)"
                        + "||(document.readyState!=='loading'&&image&&image.complete));})()",
                        ready -> {
                            if (dismissed[0]) return;
                            if ("true".equals(ready)) dismiss.run();
                            else launchHandler.postDelayed(this, 50);
                        });
                }
            });
        });
        Launchpad.verifyInstall(this);   // closed-test install verification (LaunchPad installs only)
    }

    @Override
    public void onDestroy() {
        launchHandler.removeCallbacksAndMessages(null);
        super.onDestroy();
    }
}
