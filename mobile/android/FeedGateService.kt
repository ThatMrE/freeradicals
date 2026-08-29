package app.freeradicals

/*
 * REFERENCE IMPLEMENTATION — the Android overlay.
 *
 * Two permissions do the work:
 *
 *   PACKAGE_USAGE_STATS   read which app is in the foreground (Settings ->
 *                         Special access -> Usage access).
 *   SYSTEM_ALERT_WINDOW   draw over other apps.
 *
 * Prefer UsageStatsManager over an AccessibilityService: Play policy restricts
 * accessibility APIs to accessibility purposes, and digital-wellbeing apps have
 * been removed for using them this way. Usage stats plus an overlay is the
 * route that survives review. The trade-off is a poll interval — the overlay
 * lands a beat after the app opens rather than before its first frame.
 *
 * Run it as a foreground service so Android does not kill it, with a low
 * priority notification explaining why it is running.
 */

import android.app.Service
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.WindowManager

class FeedGateService : Service() {

    private val handler = Handler(Looper.getMainLooper())
    private lateinit var windows: WindowManager
    private var overlay: View? = null

    private val tick = object : Runnable {
        override fun run() {
            evaluate()
            handler.postDelayed(this, POLL_MS)
        }
    }

    override fun onCreate() {
        super.onCreate()
        windows = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        startForeground(NOTIFICATION_ID, buildNotification())
        handler.post(tick)
    }

    /** The entire decision, once a second. */
    private fun evaluate() {
        val foreground = foregroundPackage() ?: return
        val shouldBlock = foreground in GateState.blockedApps(this) && !GateState.isOpen(this)

        if (shouldBlock) showOverlay() else hideOverlay()
    }

    private fun foregroundPackage(): String? {
        val usage = getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val now = System.currentTimeMillis()
        val events = usage.queryEvents(now - LOOKBACK_MS, now)
        val event = android.app.usage.UsageEvents.Event()
        var last: String? = null
        while (events.hasNextEvent()) {
            events.getNextEvent(event)
            if (event.eventType == android.app.usage.UsageEvents.Event.MOVE_TO_FOREGROUND) {
                last = event.packageName
            }
        }
        return last
    }

    /**
     * The overlay hosts the same block screen as the extension — a React Native
     * view backed by mobile/bridge/BlockScreen.jsx, rendered into a window
     * above everything else. It is focusable so the keyboard works: the user
     * has to type in it.
     */
    private fun showOverlay() {
        if (overlay != null) return
        val view = GateOverlayView(this)
        val type =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            } else {
                @Suppress("DEPRECATION")
                WindowManager.LayoutParams.TYPE_PHONE
            }

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            type,
            WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH,
            PixelFormat.OPAQUE,
        ).apply { gravity = Gravity.TOP or Gravity.START }

        windows.addView(view, params)
        overlay = view
    }

    private fun hideOverlay() {
        overlay?.let { windows.removeView(it) }
        overlay = null
    }

    override fun onDestroy() {
        handler.removeCallbacks(tick)
        hideOverlay()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private companion object {
        const val POLL_MS = 1_000L
        const val LOOKBACK_MS = 10_000L
        const val NOTIFICATION_ID = 42
    }
}
