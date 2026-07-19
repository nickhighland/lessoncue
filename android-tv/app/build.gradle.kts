plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
}

val releaseKeystorePath = providers.environmentVariable("LESSONCUE_ANDROID_KEYSTORE_PATH").orNull
val releaseKeystorePassword = providers.environmentVariable("LESSONCUE_ANDROID_KEYSTORE_PASSWORD").orNull
val releaseKeyAlias = providers.environmentVariable("LESSONCUE_ANDROID_KEY_ALIAS").orNull
val releaseKeyPassword = providers.environmentVariable("LESSONCUE_ANDROID_KEY_PASSWORD").orNull
val releaseSigningConfigured = listOf(
    releaseKeystorePath, releaseKeystorePassword, releaseKeyAlias, releaseKeyPassword
).all { !it.isNullOrBlank() }

android {
    namespace = "org.lessoncue.tv"
    compileSdk = 36

    defaultConfig {
        applicationId = "org.lessoncue.tv"
        minSdk = 26
        targetSdk = 36
        versionCode = 40
        versionName = "0.31.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        buildConfigField("boolean", "UPDATE_ENABLED", "false")
        buildConfigField(
            "String",
            "UPDATE_MANIFEST_URL",
            "\"https://github.com/nickhighland/lessoncue/releases/latest/download/update.json\""
        )
        buildConfigField("String", "UPDATE_CHANNEL", "\"stable\"")
        buildConfigField(
            "String",
            "UPDATE_ALLOWED_HOSTS",
            "\"github.com,objects.githubusercontent.com,release-assets.githubusercontent.com\""
        )
        buildConfigField(
            "String",
            "UPDATE_SIGNING_CERT_SHA256",
            "\"E875F8F9F4E80494DF1658D5E59662BE1048D7CD5D53DB2131103051352F64AE\""
        )
    }

    signingConfigs {
        if (releaseSigningConfigured) {
            create("lessoncueRelease") {
                storeFile = file(releaseKeystorePath!!)
                storePassword = releaseKeystorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
            }
        }
    }

    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
            buildConfigField("boolean", "UPDATE_ENABLED", "true")
            if (releaseSigningConfigured) signingConfig = signingConfigs.getByName("lessoncueRelease")
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }
    packaging { resources.excludes += "/META-INF/{AL2.0,LGPL2.1}" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.17.0")
    implementation("androidx.activity:activity-compose:1.12.4")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.10.0")
    implementation("androidx.tv:tv-foundation:1.0.0")
    implementation("androidx.tv:tv-material:1.0.1")
    implementation("androidx.media3:media3-exoplayer:1.10.1")
    implementation("androidx.media3:media3-exoplayer-hls:1.10.1")
    implementation("androidx.media3:media3-ui:1.10.1")
    implementation("androidx.datastore:datastore-preferences:1.2.1")
    implementation("androidx.work:work-runtime-ktx:2.11.1")
    implementation("io.coil-kt:coil-compose:2.7.0")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20250517")
    androidTestImplementation("androidx.test.ext:junit:1.3.0")
    androidTestImplementation("androidx.compose.ui:ui-test-junit4:1.10.5")
    debugImplementation("androidx.compose.ui:ui-test-manifest:1.10.5")
}
