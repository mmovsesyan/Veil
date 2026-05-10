package com.contentblocker.vpn

import android.content.Intent
import android.net.VpnService
import android.os.ParcelFileDescriptor
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.InetSocketAddress
import java.nio.ByteBuffer
import java.nio.channels.DatagramChannel

/**
 * Local VPN service for system-wide ad/tracker blocking on Android.
 *
 * How it works:
 * 1. Creates a local VPN tunnel (no external server)
 * 2. All device traffic routes through the tunnel
 * 3. DNS requests are intercepted and checked against block lists
 * 4. Blocked domains resolve to 0.0.0.0 (NXDOMAIN)
 * 5. Allowed traffic passes through unchanged
 *
 * This is the same approach used by AdGuard, Blokada, and DNS66.
 */
class BlockerVpnService : VpnService() {

    private var vpnInterface: ParcelFileDescriptor? = null
    private var isRunning = false
    private val blockList = mutableSetOf<String>()

    companion object {
        const val VPN_ADDRESS = "10.0.0.2"
        const val VPN_DNS = "10.0.0.1"
        const val VPN_ROUTE = "0.0.0.0"
        const val DNS_PORT = 53
        const val NOTIFICATION_ID = 1
        const val CHANNEL_ID = "content_blocker_vpn"
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == "STOP") {
            stopVpn()
            return START_NOT_STICKY
        }

        startVpn()
        return START_STICKY
    }

    override fun onDestroy() {
        stopVpn()
        super.onDestroy()
    }

    private fun startVpn() {
        if (isRunning) return

        // Load block lists
        loadBlockLists()

        // Configure VPN
        val builder = Builder()
            .setSession("Content Blocker")
            .addAddress(VPN_ADDRESS, 32)
            .addRoute(VPN_ROUTE, 0)
            .addDnsServer(VPN_DNS)
            .setBlocking(true)

        vpnInterface = builder.establish() ?: return
        isRunning = true

        // Start packet processing in background thread
        Thread { processPackets() }.start()
    }

    private fun stopVpn() {
        isRunning = false
        vpnInterface?.close()
        vpnInterface = null
        stopSelf()
    }

    /**
     * Main packet processing loop.
     * Intercepts DNS queries and blocks matching domains.
     */
    private fun processPackets() {
        val vpnFd = vpnInterface ?: return
        val input = FileInputStream(vpnFd.fileDescriptor)
        val output = FileOutputStream(vpnFd.fileDescriptor)
        val buffer = ByteBuffer.allocate(32767)

        // Upstream DNS (Google DNS as fallback)
        val dnsChannel = DatagramChannel.open()
        protect(dnsChannel.socket()) // Bypass VPN for DNS queries
        dnsChannel.connect(InetSocketAddress("8.8.8.8", DNS_PORT))

        while (isRunning) {
            try {
                buffer.clear()
                val length = input.read(buffer.array())
                if (length <= 0) continue

                buffer.limit(length)

                // Check if this is a DNS query (UDP port 53)
                if (isDnsQuery(buffer)) {
                    val domain = extractDomainFromDns(buffer)
                    if (domain != null && shouldBlock(domain)) {
                        // Send NXDOMAIN response
                        val response = buildBlockedDnsResponse(buffer)
                        output.write(response)
                        continue
                    }

                    // Forward to real DNS
                    dnsChannel.write(buffer)
                    buffer.clear()
                    dnsChannel.read(buffer)
                    buffer.flip()
                    output.write(buffer.array(), 0, buffer.limit())
                } else {
                    // Non-DNS traffic: pass through
                    output.write(buffer.array(), 0, length)
                }
            } catch (e: Exception) {
                if (isRunning) {
                    // Log error but continue
                    e.printStackTrace()
                }
            }
        }

        dnsChannel.close()
    }

    /**
     * Check if a domain should be blocked.
     */
    private fun shouldBlock(domain: String): Boolean {
        val lower = domain.lowercase()

        // Direct match
        if (blockList.contains(lower)) return true

        // Parent domain match (sub.ads.com → ads.com)
        val parts = lower.split(".")
        for (i in 1 until parts.size - 1) {
            val parent = parts.subList(i, parts.size).joinToString(".")
            if (blockList.contains(parent)) return true
        }

        return false
    }

    /**
     * Load blocking rules from assets and shared preferences.
     */
    private fun loadBlockLists() {
        blockList.clear()

        // Load from bundled hosts file
        try {
            assets.open("hosts.txt").bufferedReader().useLines { lines ->
                lines.forEach { line ->
                    val trimmed = line.trim()
                    if (trimmed.isNotEmpty() && !trimmed.startsWith("#")) {
                        // Format: 0.0.0.0 domain.com or just domain.com
                        val parts = trimmed.split("\\s+".toRegex())
                        val domain = if (parts.size >= 2) parts[1] else parts[0]
                        blockList.add(domain.lowercase())
                    }
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }

        // Load user custom rules from SharedPreferences
        val prefs = getSharedPreferences("content_blocker", MODE_PRIVATE)
        val customRules = prefs.getStringSet("custom_block_domains", emptySet()) ?: emptySet()
        blockList.addAll(customRules)
    }

    // ─── DNS Packet Helpers ───────────────────────────────────────────────────

    private fun isDnsQuery(buffer: ByteBuffer): Boolean {
        // Simplified: check IP header protocol field (UDP = 17)
        if (buffer.limit() < 28) return false
        val protocol = buffer.get(9).toInt() and 0xFF
        return protocol == 17 // UDP
    }

    private fun extractDomainFromDns(buffer: ByteBuffer): String? {
        // Skip IP header (20 bytes) + UDP header (8 bytes) + DNS header (12 bytes)
        val offset = 20 + 8 + 12
        if (buffer.limit() <= offset) return null

        val sb = StringBuilder()
        var pos = offset
        while (pos < buffer.limit()) {
            val len = buffer.get(pos).toInt() and 0xFF
            if (len == 0) break
            if (sb.isNotEmpty()) sb.append(".")
            for (i in 1..len) {
                if (pos + i >= buffer.limit()) return null
                sb.append(buffer.get(pos + i).toInt().toChar())
            }
            pos += len + 1
        }

        return if (sb.isNotEmpty()) sb.toString() else null
    }

    private fun buildBlockedDnsResponse(query: ByteBuffer): ByteArray {
        // Return NXDOMAIN (response code 3) for blocked domains
        val response = query.array().copyOf(query.limit())
        // Set QR bit (response) and RCODE = 3 (NXDOMAIN)
        val headerOffset = 20 + 8 // IP + UDP headers
        if (response.size > headerOffset + 3) {
            response[headerOffset + 2] = (response[headerOffset + 2].toInt() or 0x80).toByte() // QR = 1
            response[headerOffset + 3] = (response[headerOffset + 3].toInt() or 0x03).toByte() // RCODE = 3
        }
        return response
    }
}
