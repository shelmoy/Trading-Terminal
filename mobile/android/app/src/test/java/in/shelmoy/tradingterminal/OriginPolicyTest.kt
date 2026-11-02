package `in`.shelmoy.tradingterminal
import org.junit.Assert.*
import org.junit.Test

class OriginPolicyTest {
    private val policy = OriginPolicy("terminal.example.ts.net")
    @Test fun onlyTwoConfiguredOrigins() {
        assertEquals(0, policy.brokerIndex("https://terminal.example.ts.net/trading"))
        assertEquals(1, policy.brokerIndex("https://terminal.example.ts.net:8443/scalper"))
        listOf("http://terminal.example.ts.net", "https://evil.example", "https://terminal.example.ts.net:5000", "https://terminal.example.ts.net@evil.com", "javascript:alert(1)", "file:///tmp/a").forEach { assertEquals(-1, policy.brokerIndex(it)) }
    }
    @Test fun invalidConfigCannotNavigate() { assertTrue(OriginPolicy("").origins.isEmpty()); assertTrue(OriginPolicy("evil.com").origins.isEmpty()) }
    @Test fun authProviderIsExact() {
        assertTrue(policy.oauthAllowed("https://api-t1.fyers.in/api/v3/generate-authcode?state=fake"))
        assertFalse(policy.oauthAllowed("https://api-t1.fyers.in.evil.com/api/v3/generate-authcode"))
        assertFalse(policy.oauthAllowed("https://evil@api-t1.fyers.in/api/v3/generate-authcode"))
    }
    @Test fun coldStartAndSixtySecondsLock() {
        val clock = LockClock()
        assertFalse(clock.foreground(0)); clock.unlock(); clock.background(100)
        assertTrue(clock.foreground(60099)); clock.background(70000)
        assertFalse(clock.foreground(130000)); clock.unlock(); clock.lock(); assertFalse(clock.foreground(130001))
    }
}
