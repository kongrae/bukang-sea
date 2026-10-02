package kr.hongrae.sharksos;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Launchpad.verifyInstall(this);   // closed-test install verification (LaunchPad installs only)
    }
}
