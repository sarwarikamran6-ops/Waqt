package app.waqt.prayer;

import android.Manifest;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

@CapacitorPlugin(
    name = "AdhanNative",
    permissions = {
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class AdhanPlugin extends Plugin {
    static final String PREFS = "waqt_adhan";
    static final String KEY_SCHEDULE = "schedule_json";
    static final String KEY_ENABLED = "enabled";

    @PluginMethod
    public void isNative(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("value", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33) {
            JSObject ret = new JSObject();
            ret.put("notifications", "granted");
            call.resolve(ret);
            return;
        }
        if (getPermissionState("notifications") == PermissionState.GRANTED) {
            JSObject ret = new JSObject();
            ret.put("notifications", "granted");
            call.resolve(ret);
            return;
        }
        requestPermissionForAlias("notifications", call, "notificationsPermsCallback");
    }

    @PermissionCallback
    private void notificationsPermsCallback(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put(
            "notifications",
            getPermissionState("notifications") == PermissionState.GRANTED ? "granted" : "denied"
        );
        call.resolve(ret);
    }

    @PluginMethod
    public void canScheduleExact(PluginCall call) {
        AlarmManager am = (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
        boolean ok = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            ok = am != null && am.canScheduleExactAlarms();
        }
        JSObject ret = new JSObject();
        ret.put("value", ok);
        call.resolve(ret);
    }

    @PluginMethod
    public void openExactAlarmSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
            intent.setData(android.net.Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void setEnabled(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", true));
        prefs().edit().putBoolean(KEY_ENABLED, enabled).apply();
        if (!enabled) {
            cancelAllAlarms(getContext());
            getContext().stopService(new Intent(getContext(), AdhanPlaybackService.class));
        }
        call.resolve();
    }

    @PluginMethod
    public void schedule(PluginCall call) {
        JSArray items = call.getArray("items");
        if (items == null) {
            call.reject("items required");
            return;
        }
        prefs().edit().putBoolean(KEY_ENABLED, true).putString(KEY_SCHEDULE, items.toString()).apply();
        cancelAllAlarms(getContext());
        try {
            JSONArray arr = new JSONArray(items.toString());
            Context ctx = getContext();
            long now = System.currentTimeMillis();
            int scheduled = 0;
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.getJSONObject(i);
                long at = o.getLong("at");
                if (at <= now + 2_000) continue;
                String id = o.getString("id");
                String title = o.optString("title", "Prayer");
                String kind = o.optString("kind", "regular");
                String body = o.optString("body", "");
                scheduleOne(ctx, id.hashCode(), at, title, body, kind);
                scheduled++;
            }
            JSObject ret = new JSObject();
            ret.put("scheduled", scheduled);
            call.resolve(ret);
        } catch (JSONException e) {
            call.reject("bad schedule", e);
        }
    }

    @PluginMethod
    public void playNow(PluginCall call) {
        String kind = call.getString("kind", "regular");
        String title = call.getString("title", "Adhan");
        String body = call.getString("body", "");
        Intent intent = new Intent(getContext(), AdhanPlaybackService.class);
        intent.setAction(AdhanPlaybackService.ACTION_PLAY);
        intent.putExtra(AdhanPlaybackService.EXTRA_KIND, kind);
        intent.putExtra(AdhanPlaybackService.EXTRA_TITLE, title);
        intent.putExtra(AdhanPlaybackService.EXTRA_BODY, body);
        ContextCompat.startForegroundService(getContext(), intent);
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Intent intent = new Intent(getContext(), AdhanPlaybackService.class);
        intent.setAction(AdhanPlaybackService.ACTION_STOP);
        getContext().startService(intent);
        call.resolve();
    }

    @PluginMethod
    public void cancelAll(PluginCall call) {
        cancelAllAlarms(getContext());
        prefs().edit().remove(KEY_SCHEDULE).apply();
        call.resolve();
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static void cancelAllAlarms(Context ctx) {
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String raw = prefs.getString(KEY_SCHEDULE, "[]");
        try {
            JSONArray arr = new JSONArray(raw);
            AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.getJSONObject(i);
                int requestCode = o.getString("id").hashCode();
                PendingIntent pi = pendingAlarm(ctx, requestCode, "", "", "regular");
                if (am != null) am.cancel(pi);
                pi.cancel();
            }
        } catch (JSONException ignored) {
        }
    }

    static void rescheduleFromPrefs(Context ctx) {
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (!prefs.getBoolean(KEY_ENABLED, false)) return;
        String raw = prefs.getString(KEY_SCHEDULE, "[]");
        try {
            JSONArray arr = new JSONArray(raw);
            long now = System.currentTimeMillis();
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.getJSONObject(i);
                long at = o.getLong("at");
                if (at <= now + 2_000) continue;
                scheduleOne(
                    ctx,
                    o.getString("id").hashCode(),
                    at,
                    o.optString("title", "Prayer"),
                    o.optString("body", ""),
                    o.optString("kind", "regular")
                );
            }
        } catch (JSONException ignored) {
        }
    }

    static void scheduleOne(Context ctx, int requestCode, long at, String title, String body, String kind) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        PendingIntent op = pendingAlarm(ctx, requestCode, title, body, kind);
        PendingIntent show = PendingIntent.getActivity(
            ctx,
            requestCode + 17,
            new Intent(ctx, MainActivity.class),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        AlarmManager.AlarmClockInfo info = new AlarmManager.AlarmClockInfo(at, show);
        am.setAlarmClock(info, op);
    }

    static PendingIntent pendingAlarm(Context ctx, int requestCode, String title, String body, String kind) {
        Intent intent = new Intent(ctx, AdhanAlarmReceiver.class);
        intent.setAction(AdhanAlarmReceiver.ACTION_PRAYER);
        intent.putExtra(AdhanPlaybackService.EXTRA_TITLE, title);
        intent.putExtra(AdhanPlaybackService.EXTRA_BODY, body);
        intent.putExtra(AdhanPlaybackService.EXTRA_KIND, kind);
        return PendingIntent.getBroadcast(
            ctx,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }
}
