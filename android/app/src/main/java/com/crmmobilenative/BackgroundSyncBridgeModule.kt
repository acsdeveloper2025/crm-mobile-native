package com.crmmobilenative

import android.content.Context
import android.os.BatteryManager
import android.os.PowerManager
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.concurrent.TimeUnit

private const val WORK_NAME = "crm_background_sync"
private const val MIN_INTERVAL_MINUTES = 15L

class BackgroundSyncBridgeModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "BackgroundSyncBridge"

  @ReactMethod
  fun scheduleBackgroundSync(intervalMs: Double, promise: Promise) {
    try {
      val minutes = (intervalMs / 60000.0).toLong().coerceAtLeast(MIN_INTERVAL_MINUTES)
      val constraints = Constraints.Builder()
        .setRequiredNetworkType(NetworkType.CONNECTED)
        .setRequiresBatteryNotLow(true)
        .build()

      val request = PeriodicWorkRequestBuilder<BackgroundSyncWorker>(minutes, TimeUnit.MINUTES)
        .setConstraints(constraints)
        .build()

      WorkManager.getInstance(reactContext)
        .enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.UPDATE, request)

      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("SCHEDULE_FAILED", error)
    }
  }

  @ReactMethod
  fun cancelBackgroundSync(promise: Promise) {
    try {
      WorkManager.getInstance(reactContext).cancelUniqueWork(WORK_NAME)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("CANCEL_FAILED", error)
    }
  }

  @ReactMethod
  fun canRunBackgroundSync(promise: Promise) {
    try {
      val batteryManager = reactContext.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager
      val powerManager = reactContext.getSystemService(Context.POWER_SERVICE) as? PowerManager
      val batteryPct = batteryManager?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: 100
      val powerSaveMode = powerManager?.isPowerSaveMode ?: false
      promise.resolve(batteryPct > 15 && !powerSaveMode)
    } catch (error: Exception) {
      promise.reject("CHECK_FAILED", error)
    }
  }
}
