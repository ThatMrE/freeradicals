package com.freeradicals

import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

/**
 * The block screen, full screen, over whatever the user just opened.
 *
 * It renders the `FreeRadicalsBlock` surface registered in index.js — the same
 * BlockScreen component the app itself composes with, so there is one block
 * screen rather than two that drift apart.
 */
class BlockActivity : ReactActivity() {

    override fun getMainComponentName(): String = "FreeRadicalsBlock"

    override fun createReactActivityDelegate(): ReactActivityDelegate =
        object : DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled) {
            override fun getLaunchOptions(): Bundle =
                Bundle().apply { putString("appId", intent.getStringExtra(EXTRA_APP_ID)) }
        }

    /**
     * Back must not simply dismiss the gate — that would make the block screen
     * a suggestion. The user's ways out are to post, or to leave.
     */
    override fun onBackPressed() {
        moveTaskToBack(true)
    }

    companion object {
        const val EXTRA_APP_ID = "appId"
    }
}
