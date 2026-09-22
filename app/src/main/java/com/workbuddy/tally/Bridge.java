package com.workbuddy.tally;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

import androidx.core.view.WindowInsetsControllerCompat;

/**
 * JS ↔ 原生桥。
 *
 * 本应用全部本地计算、不需要联网，因此桥只做四件事：
 *   1. 用 SharedPreferences 持久化数据（比 localStorage 可靠，清 WebView 数据也不会丢）
 *   2. 把「导出数据」写进系统剪贴板
 *   3. 触感反馈
 *   4. 调整状态栏图标明暗，使其在浅色背景上可读
 *
 * @JavascriptInterface 方法运行在 WebView 的 JavaBridge 线程，
 * 一切 UI 操作都要 post 回主线程。
 */
public class Bridge {

    private static final String PREFS = "tally_prefs";
    private static final String KEY_DATA = "state";

    private final MainActivity activity;
    private final Handler main = new Handler(Looper.getMainLooper());

    public Bridge(MainActivity activity) { this.activity = activity; }

    private SharedPreferences prefs() {
        return activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** 读取账目 JSON；无数据或 schema 过期时返回空串，Web 层会按空账本启动。 */
    @JavascriptInterface
    public String getData() {
        try {
            return prefs().getString(KEY_DATA, "");
        } catch (Exception e) {
            return "";
        }
    }

    /** 写入账目 JSON。 */
    @JavascriptInterface
    public void saveData(String json) {
        if (json == null) return;
        try {
            prefs().edit().putString(KEY_DATA, json).apply();
        } catch (Exception ignored) { }
    }

    /** 清空数据（供 Web 层做「清空全部数据」用）。 */
    @JavascriptInterface
    public void clearData() {
        try {
            prefs().edit().remove(KEY_DATA).apply();
        } catch (Exception ignored) { }
    }

    /** 导出：把文本放进系统剪贴板。必须在主线程操作 ClipboardManager。 */
    @JavascriptInterface
    public void copyText(final String text) {
        if (text == null) return;
        main.post(() -> {
            try {
                ClipboardManager cm = (ClipboardManager)
                        activity.getSystemService(Context.CLIPBOARD_SERVICE);
                if (cm != null) {
                    cm.setPrimaryClip(ClipData.newPlainText("Tally 数据", text));
                    Toast.makeText(activity, "已复制到剪贴板", Toast.LENGTH_SHORT).show();
                }
            } catch (Exception ignored) { }
        });
    }

    /** 页面底色是浅色，状态栏图标需用深色。 */
    @JavascriptInterface
    public void setLightStatusBar() {
        main.post(() -> {
            try {
                WindowInsetsControllerCompat c = new WindowInsetsControllerCompat(
                        activity.getWindow(), activity.getWindow().getDecorView());
                c.setAppearanceLightStatusBars(true);
                c.setAppearanceLightNavigationBars(true);
            } catch (Exception ignored) { }
        });
    }

    /**
     * 触感反馈。
     *
     * 视觉动效没有触觉配合，就像按了没有键程的键盘 —— 这是「高级感」里
     * 最容易被忽略、也最容易被感知的一半。
     *
     * 走 View.performHapticFeedback 而不是 Vibrator：
     *   · 不需要 VIBRATE 权限
     *   · 会尊重用户在系统设置里的「触感反馈」开关，关掉就真的不震
     *   · 不同等级映射到系统预置的触感曲线，比自己写振动时长自然得多
     *
     * kind: light（按键/切换）| medium（保存确认）| heavy（删除警示）
     */
    @JavascriptInterface
    public void haptic(final String kind) {
        main.post(() -> {
            try {
                View v = activity.getWindow().getDecorView();
                if (v == null) return;

                int c = HapticFeedbackConstants.KEYBOARD_TAP;
                if ("heavy".equals(kind)) {
                    c = HapticFeedbackConstants.LONG_PRESS;
                } else if ("medium".equals(kind)) {
                    c = (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R)
                            ? HapticFeedbackConstants.CONFIRM
                            : HapticFeedbackConstants.VIRTUAL_KEY;
                }
                v.performHapticFeedback(c);
            } catch (Exception ignored) { }
        });
    }

    /** 供 Web 层做平台判断。 */
    @JavascriptInterface
    public String platform() { return "android"; }

    /**
     * Web 层初始化完成后主动拉一次安全区。
     * 原生在页面加载完成前推送的那次可能早于 JS 就绪，这里补一次握手，
     * 否则会出现「首屏顶部没有避让、切一下页面才正常」的闪烁。
     */
    @JavascriptInterface
    public void requestInsets() {
        main.post(() -> {
            try { activity.requestInsetsNow(); } catch (Exception ignored) { }
        });
    }
}
