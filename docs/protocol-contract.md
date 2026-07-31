# LessonCue protocol contract

LessonCue has one versioned display/API contract shared by the server, self-hosted browser player, and Android TV/Google TV/Fire TV client:

- `protocol/openapi.yaml` describes the supported HTTP API.
- `protocol/manifest.schema.json` describes the complete `/api/v1/screens/{screenId}/manifest` payload.
- `protocol/fixtures/manifest-v1-current.json` is generated from a real server database by `ProtocolContractTests`.
- `protocol/fixtures/manifest-v1-minimum.json` represents the oldest compatible version-1 payload.
- `protocol/fixtures/manifest-v1-future-additive.json` proves clients ignore compatible fields added by a future server.

Apple TV/tvOS is not a supported protocol target in the current product cycle.

## Compatibility rules

Within `/api/v1` and manifest `apiVersion: 1`:

1. Existing field meanings, route meanings, enum values, and authentication requirements cannot be repurposed.
2. New response fields must be optional to existing clients. Browser and Android parsers must ignore unknown fields.
3. New request requirements or removed response fields require a new API version.
4. A new display feature must be declared in the display-capability contract and have a safe fallback before it can be assigned to an incompatible display.
5. Server model, OpenAPI, JSON Schema, generated fixture, browser tests, and Android tests must change together.

## Validation

Run the structural contract checks:

```bash
npm run test:protocol
```

Run the server-generated golden fixture check:

```bash
dotnet test server/LessonCue.Server.Tests/LessonCue.Server.Tests.csproj \
  --filter FullyQualifiedName~ProtocolContractTests
```

Run browser and Android compatibility checks:

```bash
npx playwright test tests/browser/display-conformance.spec.ts
gradle -p android-tv :app:testSideloadDebugUnitTest :app:testStoreDebugUnitTest
```

CI and tagged-release validation run all four layers. Contract drift therefore fails before packaging.

## Intentionally regenerating the current fixture

After reviewing an intended compatible contract change, regenerate the golden server fixture:

```bash
LESSONCUE_WRITE_PROTOCOL_FIXTURES=1 \
  dotnet test server/LessonCue.Server.Tests/LessonCue.Server.Tests.csproj \
  --filter FullyQualifiedName~ProtocolContractTests
```

Review the complete fixture diff. Then update the schema, OpenAPI document, browser/Android parsers, and compatibility fixtures as required. Never regenerate the fixture merely to make an unexplained test failure disappear.
