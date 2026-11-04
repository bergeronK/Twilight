package info.twilyte.app;

import android.app.Activity;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * Android's share sheet, for "Share tonight's sky" and for any file the page
 * makes that isn't for the calendar (the Ephemeris's month as CSV). The app's
 * web view drops downloads and has no navigator.share, so without this none
 * of those buttons did anything. The same JS contract as the iPhone app's
 * TwilyteSharePlugin (AppDelegate.swift):
 *
 * JS name {@code TwilyteShare}: {@code share({ text?, url?, image?,
 * fileName?, fileText? })}, {@code image} a PNG as base64 (no data: prefix),
 * {@code fileText} the file's text, saved as {@code fileName}. Resolves
 * {@code { completed: true }} once the sheet is shown: Android doesn't say
 * whether anything was shared, and the page only tells "saved" apart.
 *
 * Files are written to the app's cache and handed over through the
 * FileProvider AndroidManifest.xml declares (res/xml/file_paths.xml covers
 * the cache), readable only by the app the person picks.
 */
@CapacitorPlugin(name = "TwilyteShare")
public class TwilyteSharePlugin extends Plugin {

    @PluginMethod
    public void share(PluginCall call) {
        String text = call.getString("text");
        String url = call.getString("url");
        String image = call.getString("image");
        String fileName = call.getString("fileName");
        String fileText = call.getString("fileText");
        String words = join(text, url);
        Uri uri = null;
        String type = "text/plain";
        try {
            if (image != null && !image.isEmpty()) {
                uri = cacheUri(getContext(), "twilyte-tonight.png", Base64.decode(image, Base64.DEFAULT));
                type = "image/png";
            } else if (fileName != null && fileText != null) {
                uri = cacheUri(getContext(), fileName, fileText.getBytes(StandardCharsets.UTF_8));
                type = mimeFor(fileName);
            }
        } catch (IOException | IllegalArgumentException e) {
            call.reject("Couldn't write the file to share");
            return;
        }
        if (uri == null && words == null) {
            call.reject("Nothing to share");
            return;
        }
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("No screen to share from");
            return;
        }
        Intent send = shareIntent(uri, type, words);
        activity.runOnUiThread(() -> {
            try {
                activity.startActivity(Intent.createChooser(send, null));
                JSObject r = new JSObject();
                r.put("completed", true);
                call.resolve(r);
            } catch (Exception e) {
                call.reject("Couldn't open the share sheet");
            }
        });
    }

    /** An ACTION_SEND for a file (or none) and some words (or none). */
    static Intent shareIntent(Uri uri, String type, String words) {
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType(uri != null ? type : "text/plain");
        if (uri != null) {
            send.putExtra(Intent.EXTRA_STREAM, uri);
            // The ClipData is what lets the chooser show a preview and pass
            // the read grant on to the app picked.
            send.setClipData(ClipData.newRawUri(null, uri));
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        }
        if (words != null) send.putExtra(Intent.EXTRA_TEXT, words);
        return send;
    }

    /** Writes bytes to the cache under the file's own name and returns its content:// address. */
    static Uri cacheUri(Context ctx, String name, byte[] bytes) throws IOException {
        File dir = new File(ctx.getCacheDir(), "shared");
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("no cache folder");
        String base = new File(name).getName();
        File f = new File(dir, base.isEmpty() ? "twilyte.txt" : base);
        try (FileOutputStream out = new FileOutputStream(f)) {
            out.write(bytes);
        }
        return FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", f);
    }

    static String mimeFor(String name) {
        String n = name.toLowerCase(java.util.Locale.ROOT);
        if (n.endsWith(".csv")) return "text/csv";
        if (n.endsWith(".ics")) return "text/calendar";
        if (n.endsWith(".png")) return "image/png";
        return "text/plain";
    }

    private static String join(String a, String b) {
        boolean ha = a != null && !a.isEmpty(), hb = b != null && !b.isEmpty();
        if (ha && hb) return a + " " + b;
        return ha ? a : hb ? b : null;
    }
}
