# Release recommendation

## Recommendation

**GO for temporary refactor VM testing.** The web/admin refactor, server contract, live Docker deployment, upload worker fallback, audience session/QR flow, updater transaction safety, and Android build/unit gates are green.

## Conditions before production release

1. Run the Android instrumentation suite on at least one supported Android TV/emulator profile.
2. Review the 11 web lint warnings and the Android lint warnings (API-level guard, target SDK freshness, Ethernet-only TV availability, and dependency/compile SDK updates).
3. Review the 5 dev-only npm audit findings; production dependencies are clean.
4. Recheck media conversion on a representative Linux host with Bubblewrap and, where available, Intel render-device access. The temporary VM used the documented software fallback.
