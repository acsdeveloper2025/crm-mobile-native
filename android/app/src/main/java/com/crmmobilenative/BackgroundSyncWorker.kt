package com.crmmobilenative

import android.content.Intent
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.facebook.react.HeadlessJsTaskService

class BackgroundSyncWorker(
  appContext: android.content.Context,
  workerParams: WorkerParameters,
) : CoroutineWorker(appContext, workerParams) {
  override suspend fun doWork(): Result {
    val intent = Intent(applicationContext, BackgroundSyncHeadlessService::class.java)
    applicationContext.startService(intent)
    HeadlessJsTaskService.acquireWakeLockNow(applicationContext)
    return Result.success()
  }
}
