plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
}

val terminalHost = providers.gradleProperty("terminalHost").orElse("").get()
require(terminalHost.isEmpty() || terminalHost.matches(Regex("[a-z0-9-]+\\.[a-z0-9-]+\\.ts\\.net")))
android {
    namespace = "in.shelmoy.tradingterminal"
    compileSdk = 37
    defaultConfig {
        applicationId = "in.shelmoy.tradingterminal"
        minSdk = 34
        targetSdk = 37
        versionCode = 1
        versionName = "0.1.0"
        buildConfigField("String", "TERMINAL_HOST", "\"$terminalHost\"")
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    buildFeatures { compose = true; buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    signingConfigs {
        create("personal") {
            val keyPath = providers.environmentVariable("TERMINAL_KEYSTORE").orNull
            if (keyPath != null) {
                storeFile = file(keyPath)
                storePassword = providers.environmentVariable("TERMINAL_STORE_PASSWORD").orNull
                keyAlias = "terminal"
                keyPassword = providers.environmentVariable("TERMINAL_STORE_PASSWORD").orNull
            }
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            signingConfig = signingConfigs.getByName("personal")
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2025.10.01"))
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.activity:activity-compose:1.11.0")
    implementation("androidx.fragment:fragment-ktx:1.8.9")
    implementation("androidx.biometric:biometric:1.1.0")
    implementation("androidx.browser:browser:1.10.0")
    implementation("androidx.webkit:webkit:1.18.0")
    testImplementation("junit:junit:4.13.2")
}
