# Add project specific ProGuard rules here.
# Optimasi R8 ProGuard khusus Sunmi POS & Hybrid Capacitor Bridge

-keepattributes JavascriptInterface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Jaga kelas Bridge MainActivity dan SunmiBridge agar tidak hilang saat minification
-keep class host.emergent.hybridposaceh.MainActivity$SunmiBridge {
    public *;
}
-keep class host.emergent.hybridposaceh.** { *; }

# Jaga SDK Resmi Sunmi Printer
-keep class com.sunmi.peripheral.printer.** { *; }
-dontwarn com.sunmi.peripheral.printer.**

# Jaga Capacitor Bridge
-keep class com.getcapacitor.** { *; }
-dontwarn com.getcapacitor.**

