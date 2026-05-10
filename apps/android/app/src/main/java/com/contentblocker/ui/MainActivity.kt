package com.contentblocker.ui

import android.app.Activity
import android.content.Intent
import android.net.VpnService
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.contentblocker.vpn.BlockerVpnService

/**
 * Main Activity — Jetpack Compose UI.
 * Single screen with toggle, stats, and filter list management.
 */
class MainActivity : ComponentActivity() {

    private val vpnPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            startBlocker()
        } else {
            Toast.makeText(this, "VPN permission required for blocking", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                ContentBlockerScreen(
                    onToggle = { enabled ->
                        if (enabled) requestVpnPermission() else stopBlocker()
                    }
                )
            }
        }
    }

    private fun requestVpnPermission() {
        val intent = VpnService.prepare(this)
        if (intent != null) {
            vpnPermissionLauncher.launch(intent)
        } else {
            startBlocker()
        }
    }

    private fun startBlocker() {
        val intent = Intent(this, BlockerVpnService::class.java)
        startService(intent)
    }

    private fun stopBlocker() {
        val intent = Intent(this, BlockerVpnService::class.java).apply {
            action = "STOP"
        }
        startService(intent)
    }
}

@Composable
fun ContentBlockerScreen(onToggle: (Boolean) -> Unit) {
    var isEnabled by remember { mutableStateOf(false) }
    var totalBlocked by remember { mutableIntStateOf(0) }

    val filterLists = remember {
        mutableStateListOf(
            FilterList("easylist", "EasyList", "Реклама", true, 75000),
            FilterList("easyprivacy", "EasyPrivacy", "Трекеры", true, 30000),
            FilterList("fanboy-social", "Fanboy Social", "Соц. виджеты", true, 15000),
            FilterList("ruadlist", "RU AdList", "Региональный", true, 25000),
        )
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // Header
        item {
            Text(
                "Content Blocker",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(8.dp))
        }

        // Main Toggle
        item {
            Card(modifier = Modifier.fillMaxWidth()) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text("Защита", style = MaterialTheme.typography.titleMedium)
                        Text(
                            if (isEnabled) "Активна" else "Отключена",
                            color = if (isEnabled) MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodySmall
                        )
                    }
                    Switch(
                        checked = isEnabled,
                        onCheckedChange = {
                            isEnabled = it
                            onToggle(it)
                        }
                    )
                }
            }
        }

        // Stats
        item {
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        "$totalBlocked",
                        style = MaterialTheme.typography.displaySmall,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary
                    )
                    Text("заблокировано", style = MaterialTheme.typography.bodyMedium)
                }
            }
        }

        // Filter Lists
        item {
            Text(
                "Списки фильтров",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(top = 8.dp)
            )
        }

        items(filterLists) { list ->
            Card(modifier = Modifier.fillMaxWidth()) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(list.name, style = MaterialTheme.typography.bodyLarge)
                        Text(
                            "${list.category} · ${list.rulesCount / 1000}K правил",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    Switch(
                        checked = list.enabled,
                        onCheckedChange = { enabled ->
                            val idx = filterLists.indexOf(list)
                            if (idx >= 0) {
                                filterLists[idx] = list.copy(enabled = enabled)
                            }
                        }
                    )
                }
            }
        }
    }
}

data class FilterList(
    val id: String,
    val name: String,
    val category: String,
    val enabled: Boolean,
    val rulesCount: Int
)
