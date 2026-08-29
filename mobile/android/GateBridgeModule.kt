package app.freeradicals

/*
 * REFERENCE IMPLEMENTATION — the Android half of the port.
 *
 * This file is a specification in Kotlin, not a compiled artifact of this repo.
 * It shows the whole native surface the shared core needs: one method.
 *
 * The design point: JS decides *whether* the gate is open and writes the answer
 * here as an absolute timestamp. Native code never runs gate logic, never
 * counts down, and never needs the React Native context alive — it compares
 * `unlockedUntil` to the wall clock and blocks or does not block.
 */

import android.content.Context
import androidx.core.content.edit
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap

class GateBridgeModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "FreeRadicals"

    /** Called from mobile/bridge/gateController.js on every state change. */
    @ReactMethod
    fun setGateState(state: ReadableMap) {
        GateState.write(
            reactApplicationContext,
            status = state.getString("status") ?: "locked",
            unlockedUntil = state.getDouble("unlockedUntil").toLong(),
            blockedApps = state.getArray("blockedApps")
                ?.toArrayList()
                ?.map { it.toString() }
                ?.toSet()
                ?: emptySet(),
        )
    }
}

/**
 * The shared read model. Written by JS, read by the foreground watcher and the
 * overlay — both of which run when no JS is alive.
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

    fun isOpen(context: Context): Boolean {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        return System.currentTimeMillis() < prefs.getLong("unlockedUntil", 0L)
    }

    fun blockedApps(context: Context): Set<String> =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getStringSet("blockedApps", emptySet()) ?: emptySet()
}
