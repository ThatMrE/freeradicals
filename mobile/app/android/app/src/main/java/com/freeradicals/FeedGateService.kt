package com.freeradicals

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper

/**
 * Watches which app is in the foreground and puts the block screen over the
 * ones the user chose, whenever no window is open.
 *
 * Uses UsageStatsManager rather than an AccessibilityService. Accessibility
 * would see the foreground app sooner and more precisely, but Play policy
 * restricts those APIs to accessibility purposes and wellbeing apps have been
 * removed for exactly this pattern. The cost of doing it the compliant way is
 * the poll interval below: the block screen lands a beat after the app opens
 * rather than before its first frame.
 *
 * It launches BlockActivity rather than adding a raw window. An activity gets
 * a real React surface, a keyboard that works, and a back stack the system
 * understands — all of which a hand-managed overlay View has to reinvent.
 * SYSTEM_ALERT_WINDOW is what permits the launch from the background.
 */
class FeedGateService : Service() {

    private val handler = Handler(Looper.getMainLooper())
    private var lastBlocked: String? = null

    private val tick = object : Runnable {
        override fun run() {
            evaluate()
            handler.postDelayed(this, POLL_MS)
        }
    }

    override fun onCreate() {
        super.onCreate()
        startAsForeground()
        handler.post(tick)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // A window may have just opened; do not wait for the next tick.
        if (intent?.action == ACTION_REFRESH) evaluate()
        return START_STICKY
    }

    /** The entire decision, once a second. */
    private fun evaluate() {
        val foreground = foregroundPackage()
        if (foreground == null || foreground == packageName) return

        val watched = foreground in GateState.blockedApps(this)
        if (!watched || GateState.isOpen(this)) {
            lastBlocked = null
            return
        }

        // One block screen per visit, not one per second.
        if (lastBlocked == foreground) return
        lastBlocked = foreground

        startActivity(
            Intent(this, BlockActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
                putExtra(BlockActivity.EXTRA_APP_ID, foreground)
            },
        )
    }

    private fun foregroundPackage(): String? {
        val usage = getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val now = System.currentTimeMillis()
        val events = usage.queryEvents(now - LOOKBACK_MS, now)
        val event = UsageEvents.Event()
        var last: String? = null
        while (events.hasNextEvent()) {
            events.getNextEvent(event)
            if (event.eventType == UsageEvents.Event.ACTIVITY_RESUMED) last = event.packageName
        }
        return last
    }

    private fun startAsForeground() {
        val manager = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(
                NotificationChannel(CHANNEL, "Feed gate", NotificationManager.IMPORTANCE_MIN).apply {
                    description = "Keeps watch so feeds stay closed until you post."
                },
            )
        }

        val notification: Notification = Notification.Builder(this, CHANNEL)
            .setContentTitle("Free Radicals is watching your feeds")
            .setContentText("Post something to open one.")
            .setSmallIcon(android.R.drawable.ic_lock_idle_lock)
            .setOngoing(true)
            .build()

        // Android 14 requires every foreground service to declare a type.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    override fun onDestroy() {
        handler.removeCallbacks(tick)
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        private const val POLL_MS = 1_000L
        private const val LOOKBACK_MS = 10_000L
        private const val NOTIFICATION_ID = 42
        private const val CHANNEL = "freeradicals.gate"
        private const val ACTION_REFRESH = "com.freeradicals.REFRESH"

        fun start(context: Context) {
            context.startForegroundService(Intent(context, FeedGateService::class.java))
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, FeedGateService::class.java))
        }

        fun refresh(context: Context) {
            context.startService(
                Intent(context, FeedGateService::class.java).setAction(ACTION_REFRESH),
            )
        }
    }
}
