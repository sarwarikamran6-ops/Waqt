package app.waqt.prayer;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import androidx.core.content.ContextCompat;

public class AdhanAlarmReceiver extends BroadcastReceiver {
    public static final String ACTION_PRAYER = "app.waqt.prayer.ACTION_PRAYER";
    public static final String ACTION_BOOT = "app.waqt.prayer.ACTION_BOOT";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action) || ACTION_BOOT.equals(action)) {
            AdhanPlugin.rescheduleFromPrefs(context);
            return;
        }
        if (!ACTION_PRAYER.equals(action)) return;

        Intent service = new Intent(context, AdhanPlaybackService.class);
        service.setAction(AdhanPlaybackService.ACTION_PLAY);
        service.putExtra(
            AdhanPlaybackService.EXTRA_KIND,
            intent.getStringExtra(AdhanPlaybackService.EXTRA_KIND)
        );
        service.putExtra(
            AdhanPlaybackService.EXTRA_TITLE,
            intent.getStringExtra(AdhanPlaybackService.EXTRA_TITLE)
        );
        service.putExtra(
            AdhanPlaybackService.EXTRA_BODY,
            intent.getStringExtra(AdhanPlaybackService.EXTRA_BODY)
        );
        ContextCompat.startForegroundService(context, service);
    }
}
