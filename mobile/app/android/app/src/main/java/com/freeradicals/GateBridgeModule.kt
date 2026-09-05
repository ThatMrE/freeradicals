package com.freeradicals

import android.app.AppOpsManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Process
import android.provider.Settings
import androidx.core.content.edit
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap

/**
 * The native surface, and it is deliberately small.
 *
 * JavaScript decides *whether* the gate is open and writes the answer here as
 * an absolute timestamp. Native code never runs gate logic and never counts
 * down — it compares one number to the wall clock. That is what lets the
 * overlay keep working while the React Native context is asleep or dead.
 */
class GateBridgeModule(private val context: ReactApplicationContext) :
    ReactContextBaseJavaModule(context) {

    override fun getName() = "FreeRadicals"

    /** Called from mobile/bridge/nativeMirror.js on every state change. */
    @ReactMethod
    fun setGateState(state: ReadableMap) {
        GateState.write(
            context,
            status = state.getString("status") ?: "locked",
            unlockedUntil = state.getDouble("unlockedUntil").toLong(),
            blockedApps = state.getArray("blockedApps")
                ?.toArrayList()
                ?.map { it.toString() }
                ?.toSet()
                ?: emptySet(),
        )
        // A window that just opened should take effect before the next poll.
        FeedGateService.refresh(context)
    }

    /**
     * Neither permission can be granted from an in-app prompt; both live in
     * Settings. The UI reports their real state rather than assuming.
     */
    @ReactMethod
    fun getPermissions(promise: Promise) {
        promise.resolve(
            Arguments.createMap().apply {
                putBoolean("usageAccess", hasUsageAccess())
                putBoolean("overlay", Settings.canDrawOverlays(context))
            },
        )
    }

    @ReactMethod
    fun openUsageAccessSettings() {
        open(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))
    }

    @ReactMethod
    fun openOverlaySettings() {
        open(
            Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:${context.packageName}"),
            ),
        )
    }

    @ReactMethod
    fun startWatching() {
        if (!hasUsageAccess() || !Settings.canDrawOverlays(context)) return
        FeedGateService.start(context)
    }

    @ReactMethod
    fun stopWatching() {
        FeedGateService.stop(context)
    }

    private fun open(intent: Intent) {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
    }

    private fun hasUsageAccess(): Boolean {
        val ops = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ops.unsafeCheckOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName,
            )
        } else {
            @Suppress("DEPRECATION")
            ops.checkOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName,
            )
        }
        return mode == AppOpsManager.MODE_ALLOWED
    }
}

/**
 * The shared read model: written by JavaScript, read by the watcher, which
 * runs when no JavaScript is alive.
 */
object GateState {
    private const val PREFS = "freeradicals.gate"

    fun write(context: Context, status: String, unlockedUntil: Long, blockedApps: Set<String>) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit {
            putString("status", status)
            putLong("unlockedUntil", unlockedUntil)
            putStringSet("blockedApps", blockedApps)
        }
    }

    fun isOpen(context: Context): Boolean =
        System.currentTimeMillis() <
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getLong("unlockedUntil", 0L)

    fun blockedApps(context: Context): Set<String> =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getStringSet("blockedApps", emptySet()) ?: emptySet()
}
