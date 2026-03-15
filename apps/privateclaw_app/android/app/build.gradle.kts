import java.io.FileInputStream
import java.util.Properties

plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

val keystoreProperties = Properties()
val keystorePropertiesFile = rootProject.file("key.properties")
val googleServicesFile = project.file("google-services.json")

if (keystorePropertiesFile.exists()) {
    FileInputStream(keystorePropertiesFile).use { keystoreProperties.load(it) }
}

fun signingSetting(propertyName: String, envName: String): String? {
    val envValue = System.getenv(envName)
    if (!envValue.isNullOrBlank()) {
        return envValue
    }

    return keystoreProperties.getProperty(propertyName)?.takeIf { it.isNotBlank() }
}

val releaseStoreFile = signingSetting("storeFile", "PRIVATECLAW_ANDROID_KEYSTORE_PATH")
val releaseStorePassword = signingSetting("storePassword", "PRIVATECLAW_ANDROID_KEYSTORE_PASSWORD")
val releaseKeyAlias = signingSetting("keyAlias", "PRIVATECLAW_ANDROID_KEY_ALIAS")
val releaseKeyPassword = signingSetting("keyPassword", "PRIVATECLAW_ANDROID_KEY_PASSWORD")
val hasReleaseSigning = listOf(
    releaseStoreFile,
    releaseStorePassword,
    releaseKeyAlias,
    releaseKeyPassword,
).all { !it.isNullOrBlank() }

if (googleServicesFile.exists()) {
    apply(plugin = "com.google.gms.google-services")
} else {
    logger.lifecycle("google-services.json not found; Firebase push is disabled for this Android build.")
}

android {
    namespace = "gg.ai.privateclaw"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    defaultConfig {
        applicationId = "gg.ai.privateclaw"
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        create("release") {
            if (hasReleaseSigning) {
                storeFile = file(releaseStoreFile!!)
                storePassword = releaseStorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
            }
        }
    }

    buildTypes {
        release {
            signingConfig = if (hasReleaseSigning) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
        }
    }
}

flutter {
    source = "../.."
}
