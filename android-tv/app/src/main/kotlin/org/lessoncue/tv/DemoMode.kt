package org.lessoncue.tv

/**
 * The Fire TV review demo uses a local marker instead of a real server. These
 * values must be handled before endpoint discovery so the review path cannot
 * generate DNS, HTTP, pairing, or telemetry traffic.
 */
const val DEMO_SERVER_URL = "http://lsnq.demo"
const val DEMO_PASSWORD = "123456"

fun isDemoServerUrl(value: String): Boolean =
    value.trim().trimEnd('/').equals(DEMO_SERVER_URL, ignoreCase = true)

fun isDemoPassword(value: String): Boolean = value == DEMO_PASSWORD
