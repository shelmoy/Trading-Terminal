package `in`.shelmoy.tradingterminal

import java.net.URI

class OriginPolicy(host: String) {
    val origins: List<String> = if (host.matches(Regex("[a-z0-9-]+\\.[a-z0-9-]+\\.ts\\.net")))
        listOf("https://$host", "https://$host:8443") else emptyList()

    fun brokerIndex(url: String): Int = runCatching {
        val uri = URI(url)
        if (uri.scheme != "https" || uri.rawUserInfo != null) return -1
        val origin = "https://${uri.host}" + if (uri.port == -1 || uri.port == 443) "" else ":${uri.port}"
        origins.indexOf(origin)
    }.getOrDefault(-1)

    fun oauthAllowed(url: String): Boolean = runCatching {
        val uri = URI(url)
        uri.scheme == "https" && uri.host == "api-t1.fyers.in" && uri.rawUserInfo == null &&
            uri.port in listOf(-1, 443) && uri.path == "/api/v3/generate-authcode"
    }.getOrDefault(false)
}

class LockClock {
    private var backgroundAt: Long? = null
    var unlocked = false
        private set
    fun unlock() { unlocked = true; backgroundAt = null }
    fun background(now: Long) { backgroundAt = now }
    fun foreground(now: Long): Boolean {
        if (backgroundAt?.let { now - it >= 60_000 || now < it } == true) unlocked = false
        backgroundAt = null
        return unlocked
    }
    fun lock() { unlocked = false }
}
