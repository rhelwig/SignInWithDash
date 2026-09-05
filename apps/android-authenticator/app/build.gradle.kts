plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "org.siwd.authenticator"
    compileSdk = 35

    defaultConfig {
        applicationId = "org.siwd.authenticator"
        // Android 8.0+ (API 26) — broad sideload coverage without Play Services requirements
        minSdk = 26
        targetSdk = 35
        versionCode = 5
        versionName = "0.1.2"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    flavorDimensions += "network"
    productFlavors {
        create("dashTestnet") {
            dimension = "network"
            applicationIdSuffix = ".testnet"
            versionName = "0.1.2-testnet"
            buildConfigField("boolean", "IS_MAINNET", "false")
            buildConfigField("boolean", "TESTNET_ONLY", "true")
            buildConfigField(
                "String",
                "QUORUM_BASE_URL",
                "\"https://quorums.testnet.networks.dash.org\"",
            )
        }
        create("dashMainnet") {
            dimension = "network"
            versionName = "0.1.2-mainnet-private"
            buildConfigField("boolean", "IS_MAINNET", "true")
            buildConfigField("boolean", "TESTNET_ONLY", "false")
            buildConfigField(
                "String",
                "QUORUM_BASE_URL",
                "\"https://quorums.mainnet.networks.dash.org\"",
            )
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
        debug {
            applicationIdSuffix = if (providers.gradleProperty("siwdSecurityAudit").orNull == "true") ".securityaudit" else ".debug"
            versionNameSuffix = "-debug"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }
    kotlinOptions {
        jvmTarget = "21"
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
        jniLibs {
            useLegacyPackaging = true
        }
    }
}

dependencies {
    implementation(project(":protocol"))

    val composeBom = platform("androidx.compose:compose-bom:2024.10.01")
    implementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.navigation:navigation-compose:2.8.3")
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
    implementation("androidx.biometric:biometric:1.1.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    // QR: ML Kit optional later; start with manual URL paste + CameraX path stub
    implementation("androidx.camera:camera-camera2:1.4.0")
    implementation("androidx.camera:camera-lifecycle:1.4.0")
    implementation("androidx.camera:camera-view:1.4.0")
    // Offline QR decode (no Play ML Kit / Google services)
    implementation("com.google.zxing:core:3.5.3")
    implementation("androidx.fragment:fragment-ktx:1.8.5")
    implementation("androidx.compose.material:material-icons-extended")

    // On-device Dash Platform (same stack as DashPay wallet; no demo-web proxy required)
    implementation("org.dashj.platform:dash-sdk-android:4.0.0")
    implementation("org.dashj.platform:dash-sdk-kotlin:4.0.0") {
        exclude(group = "org.bouncycastle", module = "bcprov-jdk15to18")
    }
    implementation("org.dashj.platform:dash-sdk-java:4.0.0")
    implementation("org.dashj:dashj-core:22.0.4") {
        exclude(group = "org.bouncycastle", module = "bcprov-jdk15to18")
        exclude(group = "org.bouncycastle", module = "bcprov-jdk15on")
    }
    implementation("org.dashj.android:dashj-bls-android:1.0.1")
    implementation("org.dashj.android:dashj-x11-android:1.0.0")
    implementation("org.slf4j:slf4j-android:1.7.36")
    // Single BouncyCastle for app + protocol + dashj
    implementation("org.bouncycastle:bcprov-jdk18on:1.79")

    debugImplementation("androidx.compose.ui:ui-tooling")
}

configurations.all {
    exclude(group = "org.bouncycastle", module = "bcprov-jdk15to18")
    exclude(group = "org.bouncycastle", module = "bcprov-jdk15on")
}
