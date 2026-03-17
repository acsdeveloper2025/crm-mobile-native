# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

# WorkManager and its Room-generated database use reflection during startup.
# Keep the generated impl and worker constructors in release builds so
# androidx.startup can initialize without crashing under R8.
-keep class androidx.work.impl.WorkDatabase_Impl { *; }
-keep class * extends androidx.room.RoomDatabase { *; }
-keep class * extends androidx.work.ListenableWorker {
    <init>(android.content.Context, androidx.work.WorkerParameters);
}

# NetInfo is resolved through the React Native package registry / TurboModule
# path. Keep its package and generated spec intact in release builds so the
# native module remains discoverable under R8.
-keep class com.reactnativecommunity.netinfo.** { *; }
