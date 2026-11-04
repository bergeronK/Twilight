package info.twilyte.app;

import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

/**
 * The app's web view: Capacitor's own, plus Twilyte's share and calendar
 * plugins (registered before the bridge is made, as Capacitor requires), and
 * the back button.
 */
public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(TwilyteSharePlugin.class);
        registerPlugin(TwilyteCalendarPlugin.class);
        super.onCreate(savedInstanceState);
        getOnBackPressedDispatcher().addCallback(this, back);
    }

    /*
     * Back closes what's open on the page first (Sky View, the welcome,
     * Settings, the place picker: `twBack` in index.html sends them the
     * Escape they already close on), then goes back from Help or Privacy,
     * and only then leaves the app. Capacitor leaves back to its App plugin,
     * which Twilyte doesn't use, so without this back left the app from
     * anywhere, Sky View included.
     */
    private final OnBackPressedCallback back = new OnBackPressedCallback(true) {
        @Override
        public void handleOnBackPressed() {
            WebView web = bridge != null ? bridge.getWebView() : null;
            if (web == null) {
                leave();
                return;
            }
            web.evaluateJavascript("typeof twBack === 'function' && twBack() === true", handled -> {
                if ("true".equals(handled)) return;
                if (web.canGoBack()) web.goBack();
                else leave();
            });
        }

        private void leave() {
            setEnabled(false);
            getOnBackPressedDispatcher().onBackPressed();
            setEnabled(true);
        }
    };
}
