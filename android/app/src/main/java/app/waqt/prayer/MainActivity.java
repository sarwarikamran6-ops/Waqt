package app.waqt.prayer;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AdhanPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
