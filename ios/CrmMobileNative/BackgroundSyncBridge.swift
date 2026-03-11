import Foundation
import BackgroundTasks
import React

@objc(BackgroundSyncBridge)
class BackgroundSyncBridge: NSObject, RCTBridgeModule {
  static let taskIdentifier = "com.crmmobilenative.backgroundsync"

  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }

  @objc(scheduleBackgroundSync:resolve:reject:)
  func scheduleBackgroundSync(_ intervalMs: NSNumber, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    if #available(iOS 13.0, *) {
      do {
        let request = BGAppRefreshTaskRequest(identifier: Self.taskIdentifier)
        let seconds = max(15 * 60, intervalMs.doubleValue / 1000.0)
        request.earliestBeginDate = Date(timeIntervalSinceNow: seconds)
        try BGTaskScheduler.shared.submit(request)
        resolve(true)
      } catch {
        reject("SCHEDULE_FAILED", "Unable to schedule background sync", error)
      }
      return
    }

    resolve(false)
  }

  @objc(cancelBackgroundSync:reject:)
  func cancelBackgroundSync(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    if #available(iOS 13.0, *) {
      BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: Self.taskIdentifier)
    }
    resolve(true)
  }

  @objc(canRunBackgroundSync:reject:)
  func canRunBackgroundSync(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    if ProcessInfo.processInfo.isLowPowerModeEnabled {
      resolve(false)
      return
    }
    resolve(true)
  }

  @available(iOS 13.0, *)
  @objc
  static func registerBackgroundTaskHandler() {
    BGTaskScheduler.shared.register(forTaskWithIdentifier: taskIdentifier, using: nil) { task in
      guard let refreshTask = task as? BGAppRefreshTask else {
        task.setTaskCompleted(success: false)
        return
      }
      scheduleNextRefresh()

      // The JS daemon/background hook handles sync when app is resumed/woken.
      refreshTask.expirationHandler = {
        refreshTask.setTaskCompleted(success: false)
      }
      refreshTask.setTaskCompleted(success: true)
    }
  }

  @available(iOS 13.0, *)
  @objc
  static func scheduleNextRefresh() {
    let request = BGAppRefreshTaskRequest(identifier: taskIdentifier)
    request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
    try? BGTaskScheduler.shared.submit(request)
  }
}
