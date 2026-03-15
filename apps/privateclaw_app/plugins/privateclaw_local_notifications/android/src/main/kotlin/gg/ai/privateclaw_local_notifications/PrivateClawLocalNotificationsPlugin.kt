package gg.ai.privateclaw_local_notifications

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import io.flutter.embedding.engine.plugins.FlutterPlugin
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel

class PrivateClawLocalNotificationsPlugin : FlutterPlugin, MethodChannel.MethodCallHandler {
    private lateinit var applicationContext: Context
    private lateinit var channel: MethodChannel

    override fun onAttachedToEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        applicationContext = binding.applicationContext
        channel = MethodChannel(binding.binaryMessenger, "gg.ai.privateclaw/local_notifications")
        channel.setMethodCallHandler(this)
    }

    override fun onDetachedFromEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        channel.setMethodCallHandler(null)
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "show" -> showNotification(call, result)
            else -> result.notImplemented()
        }
    }

    private fun showNotification(call: MethodCall, result: MethodChannel.Result) {
        val arguments = call.arguments as? Map<*, *> ?: run {
            result.error("invalid_args", "Expected notification arguments.", null)
            return
        }
        val notificationId = (arguments["id"] as? Number)?.toInt() ?: run {
            result.error("invalid_id", "Notification id is required.", null)
            return
        }
        val title = (arguments["title"] as? String)?.trim().orEmpty()
        val body = (arguments["body"] as? String)?.trim().orEmpty()
        if (title.isEmpty() || body.isEmpty()) {
            result.error("invalid_content", "Notification title and body are required.", null)
            return
        }

        val channelId = (arguments["channelId"] as? String)?.trim().takeUnless { it.isNullOrEmpty() }
            ?: "privateclaw_messages"
        val channelName = (arguments["channelName"] as? String)?.trim().takeUnless { it.isNullOrEmpty() }
            ?: "PrivateClaw messages"
        val channelDescription = (arguments["channelDescription"] as? String)?.trim()
        val payload = (arguments["payload"] as? String)?.trim()

        ensureChannel(channelId, channelName, channelDescription)
        val notification = NotificationCompat.Builder(applicationContext, channelId)
            .setSmallIcon(applicationContext.applicationInfo.icon)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .apply {
                buildLaunchIntent(payload)?.let(::setContentIntent)
            }
            .build()

        try {
            NotificationManagerCompat.from(applicationContext).notify(notificationId, notification)
            result.success(null)
        } catch (error: SecurityException) {
            result.error("permission_denied", error.message, null)
        }
    }

    private fun ensureChannel(
        channelId: String,
        channelName: String,
        channelDescription: String?,
    ) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return
        }

        val manager = applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channel = NotificationChannel(
            channelId,
            channelName,
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = channelDescription
            enableVibration(true)
        }
        manager.createNotificationChannel(channel)
    }

    private fun buildLaunchIntent(payload: String?): PendingIntent? {
        val launchIntent = applicationContext.packageManager.getLaunchIntentForPackage(
            applicationContext.packageName,
        ) ?: return null
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        if (!payload.isNullOrBlank()) {
            launchIntent.putExtra("privateclaw_notification_payload", payload)
        }
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }
        val requestCode = payload?.hashCode() ?: 0
        return PendingIntent.getActivity(applicationContext, requestCode, launchIntent, flags)
    }
}
