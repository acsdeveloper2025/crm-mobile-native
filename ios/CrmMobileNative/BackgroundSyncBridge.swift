import Foundation
import BackgroundTasks
import React
// 2026-05-18: RN 0.84's React-Core xcframework no longer exposes
// `RCTBridgeModule` as a Swift-importable module. Exposure is via the
// bridging header `CrmMobileNative-Bridging-Header.h` (wired in
// project.pbxproj SWIFT_OBJC_BRIDGING_HEADER).

@objc(BackgroundSyncBridge)
class BackgroundSyncBridge: NSObject, RCTBridgeModule {
  static let taskIdentifier = "com.crmmobilenative.backgroundsync"

  // 2026-05-18: RN 0.84 made `moduleName()` a required protocol method on
  // RCTBridgeModule (was previously auto-derived from the @objc class
  // name macro). Explicitly returning the bridge name keeps the bridge
  // wiring identical to the prior auto-derived name.
  static func moduleName() -> String! {
    return "BackgroundSyncBridge"
  }

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
