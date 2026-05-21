package com.quare.network

import com.quare.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

object QuareAPI {
    private val baseUrl get() = BuildConfig.API_URL.ifBlank { "" }

    suspend fun storeDocument(data: JSONObject): String = withContext(Dispatchers.IO) {
        val conn = (URL("$baseUrl/documents").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            setRequestProperty("Content-Type", "application/json")
            doOutput = true
        }
        conn.outputStream.use { it.write(data.toString().toByteArray()) }
        check(conn.responseCode == 201) { "Store failed: ${conn.responseCode}" }
        JSONObject(conn.inputStream.bufferedReader().readText()).getString("pin")
    }

    suspend fun retrieveDocument(pin: String): JSONObject = withContext(Dispatchers.IO) {
        val conn = URL("$baseUrl/documents/$pin").openConnection() as HttpURLConnection
        check(conn.responseCode == 200) { "Not found: ${conn.responseCode}" }
        JSONObject(conn.inputStream.bufferedReader().readText())
    }
}
