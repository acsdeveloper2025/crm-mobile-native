//
//  CrmMobileNative-Bridging-Header.h
//
//  2026-05-18: RN 0.84 ships React-Core as a prebuilt xcframework and the
//  Obj-C bridging types (RCTBridgeModule, RCTPromise*Block) are no longer
//  surfaced by `import React` alone in Swift. Bridging header explicitly
//  exposes them so Swift modules like BackgroundSyncBridge can implement
//  RCTBridgeModule.
//

#import <React/RCTBridgeModule.h>
#import <React/RCTBridge.h>
