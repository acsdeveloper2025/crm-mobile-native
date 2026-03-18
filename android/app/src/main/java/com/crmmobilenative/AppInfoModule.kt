package com.crmmobilenative

import android.os.Build
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule

class AppInfoModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "AppInfo"

  override fun getConstants(): MutableMap<String, Any> {
    val context = reactApplicationContext
    val packageManager = context.packageManager
    val packageName = context.packageName
    val packageInfo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      packageManager.getPackageInfo(
        packageName,
        android.content.pm.PackageManager.PackageInfoFlags.of(0)
      )
    } else {
      @Suppress("DEPRECATION")
      packageManager.getPackageInfo(packageName, 0)
    }

    val versionName = packageInfo.versionName ?: "0.0.0"
    val versionCode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      packageInfo.longVersionCode
    } else {
      @Suppress("DEPRECATION")
      packageInfo.versionCode.toLong()
    }

    return mutableMapOf(
      "versionName" to versionName,
      "versionCode" to versionCode,
    )
  }
}
