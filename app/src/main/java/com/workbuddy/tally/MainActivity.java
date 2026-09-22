package com.workbuddy.tally;

import android.annotation.SuppressLint;
import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

/**
 * WebView 宿主：安全区与软键盘避让、JS 桥接注册、系统返回键交接。
 *
 * 界面完全由 assets/ 中的 Web 层渲染，Java 只补 WebView 自己做不到的部分：
 *   · 持久化存储（SharedPreferences）
 *   · 系统返回键
 *   · 软键盘高度上报 —— 应用是 edge-to-edge 的，窗口不会为键盘让位，
 *     必须由原生把 IME 的 inset 交给 Web 层，否则底部弹层里的输入框会被键盘盖住
 */
public class MainActivity extends AppCompatActivity {

    private WebView web;
    private Bridge bridge;
    private long lastBack = 0;

    /* 最近一次上报的安全区（物理像素），供 Web 层主动拉取时复用 */
    private int lastTop = 0;
    private int lastBottom = 0;
    private int lastKb = 0;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 让内容延伸到状态栏 / 导航栏之下，由 Web 层用 --safe-top / --safe-bottom 自行避让。
        // 这样页面底色能一直铺到屏幕边缘，和设计稿的观感一致。
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        getWindow().getDecorView().setBackgroundColor(0xFFF2F2F4);
        getWindow().setSoftInputMode(
                android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE
                        | android.view.WindowManager.LayoutParams.SOFT_INPUT_STATE_UNSPECIFIED);

        web = new WebView(this);
        web.setBackgroundColor(0xFFF2F2F4);
        setContentView(web);

        // 只把数值交给 CSS 变量，不给 WebView 本身加 padding，
        // 否则会和 Web 层的避让叠加，导致顶部出现双倍留白。
        ViewCompat.setOnApplyWindowInsetsListener(web, (v, insets) -> {
            Insets bars = insets.getInsets(
                    WindowInsetsCompat.Type.systemBars()
                            | WindowInsetsCompat.Type.displayCutout());
            int nav = insets.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom;
            int ime = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom;

            /* API 30 以下 WindowInsetsCompat 会把 IME 折进 systemBars，
               键盘收起时返回的就是导航栏高度。用「明显高于导航栏」判定键盘是否真的在，
               免得页面在没弹键盘时也被顶起一条。 */
            int kb = ime > nav ? ime : 0;

            /* 原样上报**物理像素**。Android 的 WindowInsets 本来就是这个单位，
               这里不做任何换算 —— 换算放 Web 层做，避免两边各换一半对不上。
               特别地：千万不要把 px 当 CSS px 用，那会按屏幕密度放大安全区。 */
            pushInsets(bars.top, bars.bottom, kb);
            return insets;
        });

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setTextZoom(100);                 // 阻止系统字体缩放把版式撑坏
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);

        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);

        bridge = new Bridge(this);
        web.addJavascriptInterface(bridge, "NativeBridge");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                // 首帧到达后重新求一次 insets：页面加载前的那次上报会被丢弃
                view.requestApplyInsets();
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage m) {
                android.util.Log.d("WebView", m.message() + " @" + m.lineNumber());
                return true;
            }
        });

        web.loadUrl("file:///android_asset/index.html");
    }

    /** 把安全区与键盘高度交给 Web 层。页面可能还没加载完，用 typeof 兜住。 */
    private void pushInsets(int top, int bottom, int kb) {
        if (web == null) return;

        /* 记下最后一次结果：Web 层初始化时会主动来拉一次，
           避免「原生推得比 JS 就绪更早」导致安全区一直停在 0。 */
        lastTop = top;
        lastBottom = bottom;
        lastKb = kb;

        /* 把 WebView 的物理宽度一并报过去：Web 层用它除以 window.innerWidth，
           就能自我校准出本机真实的 物理px → CSS px 比例，不依赖任何假设。 */
        final int vw = web.getWidth();
        final String js =
                "(function(){" +
                        "  if(typeof window.__onInsets==='function'){" +
                        "    window.__onInsets(" + top + "," + bottom + "," + vw + ");" +
                        "  }" +
                        "  if(typeof window.__onKeyboard==='function'){" +
                        "    window.__onKeyboard(" + kb + ");" +
                        "  }" +
                        "  window.dispatchEvent(new Event('safearea'));" +
                        "})();";
        web.post(() -> {
            if (web != null) web.evaluateJavascript(js, null);
        });
    }

    /** 供 Bridge 调用：Web 层就绪后主动拉取一次当前 insets。 */
    void requestInsetsNow() {
        if (web == null) return;
        web.post(() -> {
            if (web != null) web.requestApplyInsets();
            pushInsets(lastTop, lastBottom, lastKb);
        });
    }

    /** 供 Bridge 回调用：把结果安全地交回 JS。 */
    void emit(String callbackId, boolean ok, String data, String error) {
        if (web == null) return;
        String js = "window.__nativeCallback(" + jsStr(callbackId) + "," + ok + ","
                + jsStr(data == null ? "" : data) + "," + jsStr(error == null ? "" : error) + ")";
        web.post(() -> web.evaluateJavascript(js, null));
    }

    /** 完整的 JSON 字符串转义 —— evaluateJavascript 需要合法的 JS 字面量。 */
    private static String jsStr(String s) {
        if (s == null) return "\"\"";
        StringBuilder sb = new StringBuilder("\"");
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"':  sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                case '\u2028': sb.append("\\u2028"); break;
                case '\u2029': sb.append("\\u2029"); break;
                default:
                    if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
                    else sb.append(c);
            }
        }
        return sb.append("\"").toString();
    }

    @Override
    protected void onPause() {
        // 退回后台前把内存里的账目落盘，避免 debounce 中的写入丢掉
        if (web != null) {
            web.evaluateJavascript(
                    "(function(){try{window.Store&&window.Store.flush&&window.Store.flush()}catch(e){}})()",
                    null);
        }
        super.onPause();
    }

    @Override
    public void onBackPressed() {
        if (web != null) {
            web.evaluateJavascript(
                    "(function(){try{return window.__onAndroidBack?window.__onAndroidBack():false}"
                    + "catch(e){return false}})()",
                    value -> {
                        if (!"true".equals(value)) {
                            if (System.currentTimeMillis() - lastBack < 2000) {
                                finish();
                            } else {
                                lastBack = System.currentTimeMillis();
                                web.evaluateJavascript(
                                        "(function(){try{window.__toast&&window.__toast('再按一次退出')}"
                                        + "catch(e){}})()", null);
                            }
                        }
                    });
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (web != null) { web.destroy(); web = null; }
        super.onDestroy();
    }
}
