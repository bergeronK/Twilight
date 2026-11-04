package info.twilyte.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.provider.CalendarContract;
import android.widget.Toast;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/**
 * Calendar events for the "Add to calendar" buttons (the Console's sunset
 * and sunrise, the sextant window) and the Ephemeris's month export. The
 * website downloads an .ics file for each; the app's web view drops
 * downloads, so the page sends the events it read out of its own .ics
 * ({@code icsEvents} in index.html), and the file itself, here. The same JS
 * contract as the iPhone app's TwilyteCalendarPlugin (AppDelegate.swift),
 * with no permission asked on Android:
 *
 * <ul>
 *   <li>One event: the calendar app's own new-event screen, filled in, to
 *   check and save (ACTION_INSERT, which needs no calendar permission). The
 *   reminder is the calendar's own default: Android has no way to pass one
 *   in.</li>
 *   <li>Several (a month): the .ics file, opened in whichever calendar app
 *   imports one; where none does (Google Calendar's app doesn't), the share
 *   sheet, to save it or send it on. Adding them directly would need
 *   READ_CALENDAR and WRITE_CALENDAR, more than the iPhone app's add-only
 *   access.</li>
 * </ul>
 *
 * JS name {@code TwilyteCalendar}: {@code add({ events: [{ title, start,
 * end, notes?, alarm? }], ics?, fileName? })}, start and end in ms since
 * 1970. Resolves {@code { shown }}: "editor", "calendar", "share" or "none".
 */
@CapacitorPlugin(name = "TwilyteCalendar")
public class TwilyteCalendarPlugin extends Plugin {

    @PluginMethod
    public void add(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("No screen to show the calendar from");
            return;
        }
        JSArray events = call.getArray("events", new JSArray());
        String ics = call.getString("ics");
        String fileName = call.getString("fileName", "twilyte.ics");
        JSONObject one = events.length() == 1 ? events.optJSONObject(0) : null;
        activity.runOnUiThread(() -> {
            if (one != null && openEditor(activity, one)) {
                done(call, "editor");
            } else if (ics != null && !ics.isEmpty()) {
                done(call, openFile(activity, fileName, ics));
            } else {
                Toast.makeText(activity, "There are no events in the dates shown.", Toast.LENGTH_LONG).show();
                done(call, "none");
            }
        });
    }

    private static boolean openEditor(Activity activity, JSONObject e) {
        double start = e.optDouble("start", Double.NaN), end = e.optDouble("end", Double.NaN);
        if (Double.isNaN(start) || Double.isNaN(end) || end < start) return false;
        Intent i = new Intent(Intent.ACTION_INSERT)
            .setData(CalendarContract.Events.CONTENT_URI)
            .putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, (long) start)
            .putExtra(CalendarContract.EXTRA_EVENT_END_TIME, (long) end)
            .putExtra(CalendarContract.Events.TITLE, e.optString("title", "Twilyte"));
        String notes = e.optString("notes", "");
        if (!notes.isEmpty()) i.putExtra(CalendarContract.Events.DESCRIPTION, notes);
        try {
            activity.startActivity(i);
            return true;
        } catch (ActivityNotFoundException x) {
            // No calendar app at all: the file is the way left.
            return false;
        }
    }

    private static String openFile(Activity activity, String fileName, String ics) {
        Uri uri;
        try {
            uri = TwilyteSharePlugin.cacheUri(activity, fileName, ics.getBytes(StandardCharsets.UTF_8));
        } catch (IOException | IllegalArgumentException x) {
            Toast.makeText(activity, "Couldn't make the calendar file.", Toast.LENGTH_LONG).show();
            return "none";
        }
        Intent view = new Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, "text/calendar")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            activity.startActivity(view);
            return "calendar";
        } catch (ActivityNotFoundException x) {
            activity.startActivity(Intent.createChooser(TwilyteSharePlugin.shareIntent(uri, "text/calendar", null), null));
            return "share";
        }
    }

    private static void done(PluginCall call, String shown) {
        JSObject r = new JSObject();
        r.put("shown", shown);
        call.resolve(r);
    }
}
