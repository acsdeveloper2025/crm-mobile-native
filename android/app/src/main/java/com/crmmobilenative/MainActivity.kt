package com.crmmobilenative

import android.os.Bundle
import android.view.WindowManager
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "CrmMobileNative"

  /**
   * M28 (fresh medium audit): set FLAG_SECURE on the window so the
   * OS blocks:
   *   1. Screenshots (user-initiated or via a bound accessibility
   *      service).
   *   2. Screen recording.
   *   3. Display on non-secure surfaces (e.g. when casting via a
   *      third-party app that does not set SURFACE_TYPE_SECURE).
   *   4. Thumbnails in the Android task-switcher / Recents screen.
   *
   * The app handles customer PII (names, phone numbers, IDs), case
   * details, and verification reports — all of it sensitive under
   * DPDP and similar data-protection frameworks. Blocking at the
   * window level is the coarsest-grained control but it's also the
   * only one that works uniformly across every screen, including
   * the brief render window between app launch and the first
   * navigation state being restored.
   *
   * Tradeoff: users who rely on screenshots to share a task with
   * a colleague lose that affordance. That's the correct default
   * for an internal verification app; if a specific screen needs
   * to allow captures (rarely — perhaps a help/FAQ), clear the
   * flag per-screen with `getWindow().clearFlags(FLAG_SECURE)`.
   */
  override fun onCreate(savedInstanceState: Bundle?) {
    window.setFlags(
      WindowManager.LayoutParams.FLAG_SECURE,
      WindowManager.LayoutParams.FLAG_SECURE
    )
    super.onCreate(savedInstanceState)
  }

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
