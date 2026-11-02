package `in`.shelmoy.tradingterminal

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.net.http.SslError
import android.os.Bundle
import android.os.SystemClock
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.*
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject

class MainActivity : FragmentActivity() {
    private val policy = OriginPolicy(BuildConfig.TERMINAL_HOST)
    private val clock = LockClock()
    private val webViews = mutableMapOf<Int, WebView>()
    private var unlocked by mutableStateOf(false)
    private var selected by mutableIntStateOf(0)
    private var message by mutableStateOf("Unlock your trading workspace")
    private val statuses = mutableStateListOf("Not connected", "Not connected")
    private var authPrompt: BiometricPrompt? = null
    private var pendingTicket: String? = null
    private var authPending = false
    private var fullScreen by mutableStateOf<View?>(null)
    private var fullScreenCallback: WebChromeClient.CustomViewCallback? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        handleReturn(intent)
        setContent {
            MaterialTheme(colorScheme = if (isSystemInDarkTheme()) darkColorScheme() else lightColorScheme()) {
                Surface(Modifier.fillMaxSize()) {
                    if (policy.origins.isEmpty()) {
                        CenterMessage("Cloud setup pending", "This build has no server address. Complete the private-cloud setup before installing the configured release.")
                    } else if (!unlocked) {
                        Column(Modifier.fillMaxSize().safeDrawingPadding().padding(28.dp), verticalArrangement = Arrangement.Center,
                            horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("Trading Terminal", style = MaterialTheme.typography.headlineMedium)
                            Spacer(Modifier.height(16.dp))
                            Text(message)
                            Spacer(Modifier.height(24.dp))
                            Button(onClick = ::authenticate) { Text("Unlock") }
                        }
                    } else {
                        Column(Modifier.fillMaxSize().safeDrawingPadding().imePadding()) {
                            Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                                listOf("Kotak", "FYERS").forEachIndexed { index, name ->
                                    TextButton(onClick = { selectBroker(index) }, modifier = Modifier.weight(1f)) {
                                        Text(if (selected == index) "● $name" else name)
                                    }
                                }
                                TextButton(onClick = { lock() }) { Text("Lock") }
                            }
                            Text(statuses[selected], Modifier.padding(horizontal = 16.dp), style = MaterialTheme.typography.labelSmall)
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                                listOf("Trading" to "/trading", "Scalper" to "/scalper", "Account" to "/broker").forEach { (label, path) ->
                                    TextButton(onClick = { view(selected).loadUrl(policy.origins[selected] + path) }) { Text(label) }
                                }
                            }
                            Box(Modifier.weight(1f)) {
                                key(selected) {
                                    AndroidView(factory = {
                                        view(selected).also { (it.parent as? ViewGroup)?.removeView(it) }
                                    }, modifier = Modifier.fillMaxSize())
                                }
                            }
                        }
                        fullScreen?.let { custom ->
                            AndroidView(factory = { custom }, modifier = Modifier.fillMaxSize().safeDrawingPadding())
                        }
                        BackHandler {
                            if (fullScreen != null) closeFullscreen()
                            else webViews[selected]?.let { if (it.canGoBack()) it.goBack() else finish() }
                        }
                    }
                }
            }
        }
    }

    @Composable private fun CenterMessage(title: String, text: String) {
        Column(Modifier.fillMaxSize().safeDrawingPadding().padding(28.dp), verticalArrangement = Arrangement.Center) {
            Text(title, style = MaterialTheme.typography.headlineSmall)
            Spacer(Modifier.height(16.dp))
            Text(text)
        }
    }

    private fun authenticate() {
        val authenticators = BiometricManager.Authenticators.BIOMETRIC_STRONG or BiometricManager.Authenticators.DEVICE_CREDENTIAL
        if (BiometricManager.from(this).canAuthenticate(authenticators) != BiometricManager.BIOMETRIC_SUCCESS) {
            message = "Set a screen lock or fingerprint in Android Settings to use this app."
            return
        }
        authPrompt = BiometricPrompt(this, ContextCompat.getMainExecutor(this), object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                clock.unlock(); unlocked = true; message = "Unlock your trading workspace"
                webViews.values.forEach { it.onResume() }
                completeReturn()
            }
            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) { message = errString.toString() }
        })
        authPrompt!!.authenticate(BiometricPrompt.PromptInfo.Builder().setTitle("Unlock Trading Terminal")
            .setSubtitle("Your broker session is still checked by OpenAlgo")
            .setAllowedAuthenticators(authenticators).build())
    }

    private fun lock() { clock.lock(); unlocked = false; closeFullscreen(); webViews.values.forEach { it.onPause() } }

    override fun onStop() {
        clock.background(SystemClock.elapsedRealtime())
        webViews.values.forEach { it.onPause() }
        super.onStop()
    }

    override fun onResume() {
        super.onResume()
        unlocked = clock.foreground(SystemClock.elapsedRealtime())
        if (unlocked) { webViews.values.forEach { it.onResume() }; completeReturn() }
    }

    override fun onNewIntent(intent: Intent) { super.onNewIntent(intent); setIntent(intent); handleReturn(intent); if (unlocked) completeReturn() }

    private fun handleReturn(intent: Intent?) {
        val uri = intent?.data ?: return
        if (uri.scheme != "in.shelmoy.tradingterminal" || uri.host != "oauth" || uri.path != "/fyers") return
        // Process death loses the initiating WebView flow. Do not resurrect/retry it.
        if (!authPending) { message = "Login was interrupted. Start FYERS login again."; return }
        val ticket = uri.getQueryParameter("ticket")
        if (ticket != null && ticket.matches(Regex("[A-Za-z0-9_-]{32,128}"))) pendingTicket = ticket
        else { authPending = false; statuses[1] = "FYERS login cancelled or expired" }
        intent.data = null
    }

    private fun completeReturn() {
        val ticket = pendingTicket ?: return
        val web = webViews[1] ?: return
        if (policy.brokerIndex(web.url ?: "") != 1) return
        pendingTicket = null; authPending = false; selected = 1
        val value = JSONObject.quote(ticket)
        web.evaluateJavascript("window.dispatchEvent(new CustomEvent('terminal-auth-return',{detail:$value}));", null)
    }

    private fun selectBroker(index: Int) {
        selected = index
        val existing = webViews[index]
        if (existing != null && policy.brokerIndex(existing.url ?: "") != index) existing.loadUrl(policy.origins[index] + "/auth/instance-login")
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun view(index: Int): WebView = webViews.getOrPut(index) {
        WebView(this).apply {
            importantForAutofill = View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                allowFileAccess = false
                allowContentAccess = false
                mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                javaScriptCanOpenWindowsAutomatically = false
                setSupportMultipleWindows(false)
                setSupportZoom(true)
                builtInZoomControls = true
                displayZoomControls = false
                userAgentString += " TradingTerminalAndroid/1"
                mediaPlaybackRequiresUserGesture = true
            }
            CookieManager.getInstance().setAcceptCookie(true)
            CookieManager.getInstance().setAcceptThirdPartyCookies(this, false)
            if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
                statuses[index] = "Update Android System WebView to continue"
            } else {
                WebViewCompat.addWebMessageListener(this, "TerminalNative", policy.origins.toSet()) { web, msg, origin, main, _ ->
                    if (!main || !unlocked || policy.brokerIndex(origin.toString()) != index) return@addWebMessageListener
                    val body = runCatching { JSONObject(msg.data ?: "") }.getOrNull() ?: return@addWebMessageListener
                    when (body.optString("type")) {
                        "status" -> statuses[index] = when (body.optString("status")) {
                            "connected" -> "Broker connected"
                            "signed-in" -> "OpenAlgo signed in · connect your broker"
                            "signed-out" -> "Sign in to OpenAlgo"
                            else -> "Connection unavailable · check Tailscale"
                        }
                        "fyers-cancel" -> { authPending = false; pendingTicket = null }
                        "fyers-login" -> {
                            val url = body.optString("url")
                            if (index != 1 || !policy.oauthAllowed(url) || policy.brokerIndex(web.url ?: "") != 1) return@addWebMessageListener
                            val target = Uri.parse(url)
                            if (target.getQueryParameter("redirect_uri") != policy.origins[1] + "/fyers/callback") return@addWebMessageListener
                            authPending = true
                            try { CustomTabsIntent.Builder().build().launchUrl(this@MainActivity, target) }
                            catch (_: android.content.ActivityNotFoundException) { authPending = false; statuses[1] = "Install Chrome to connect FYERS" }
                        }
                    }
                }
                webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(web: WebView, request: WebResourceRequest): Boolean {
                        val destination = policy.brokerIndex(request.url.toString())
                        if (destination == index) return false
                        if (destination >= 0 && request.isForMainFrame) {
                            selected = destination
                            view(destination).loadUrl(request.url.toString())
                        }
                        return true
                    }
                    override fun onPageStarted(web: WebView, url: String, favicon: Bitmap?) { statuses[index] = "Connecting…" }
                    override fun onPageFinished(web: WebView, url: String) {
                        if (policy.brokerIndex(url) != index) return
                        CookieManager.getInstance().flush()
                        web.evaluateJavascript("window.dispatchEvent(new Event('terminal-status-refresh'));", null)
                        if (index == 1 && unlocked) completeReturn()
                    }
                    override fun onReceivedSslError(web: WebView, handler: SslErrorHandler, error: SslError) {
                        handler.cancel(); statuses[index] = "Secure connection failed · certificate rejected"
                    }
                    override fun onReceivedError(web: WebView, req: WebResourceRequest, error: WebResourceError) {
                        if (req.isForMainFrame) statuses[index] = "Connection unavailable · check Tailscale"
                    }
                    override fun onRenderProcessGone(web: WebView, detail: RenderProcessGoneDetail): Boolean {
                        // An interrupted mutation is never replayed automatically.
                        webViews.remove(index); (web.parent as? ViewGroup)?.removeView(web); web.destroy()
                        authPending = false; pendingTicket = null; lock()
                        message = "WebView restarted. Unlock and check your books before another order."
                        return true
                    }
                }
                webChromeClient = object : WebChromeClient() {
                    override fun onShowCustomView(view: View, callback: CustomViewCallback) {
                        if (fullScreen != null) callback.onCustomViewHidden()
                        else { fullScreen = view; fullScreenCallback = callback }
                    }
                    override fun onHideCustomView() = closeFullscreen()
                    override fun onPermissionRequest(request: PermissionRequest) { request.deny() }
                }
                loadUrl(policy.origins[index] + "/auth/instance-login")
            }
        }
    }

    private fun closeFullscreen() { fullScreen = null; fullScreenCallback?.onCustomViewHidden(); fullScreenCallback = null }
    override fun onDestroy() {
        authPrompt?.cancelAuthentication()
        webViews.values.forEach { (it.parent as? ViewGroup)?.removeView(it); it.stopLoading(); it.destroy() }
        webViews.clear(); pendingTicket = null
        super.onDestroy()
    }
}
