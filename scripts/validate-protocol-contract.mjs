import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

// swagger-parser is published as CommonJS. Loading it through Node's CJS
// bridge avoids the Node 26 ESM-interop stall where a default ESM import can
// remain pending indefinitely before any contract checks run.
const require = createRequire(import.meta.url);
const SwaggerParser = require("@apidevtools/swagger-parser");

const root = resolve(import.meta.dirname, "..");
const readJson = async path =>
  JSON.parse(await readFile(resolve(root, path), "utf8"));

const manifestSchema = await readJson("protocol/manifest.schema.json");
const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  allowUnionTypes: true,
});
addFormats(ajv);
const validateManifest = ajv.compile(manifestSchema);

for (const fixtureName of [
  "manifest-v1-current.json",
  "manifest-v1-future-additive.json",
]) {
  const fixture = await readJson(`protocol/fixtures/${fixtureName}`);
  if (!validateManifest(fixture)) {
    const errors = validateManifest.errors
      ?.map(error => `  ${error.instancePath || "/"} ${error.message}`)
      .join("\n");
    throw new Error(`${fixtureName} does not match manifest.schema.json:\n${errors}`);
  }
}

const expectedZoneTypes = [
  "media",
  "stream",
  "presentation",
  "text",
  "clock",
  "calendar",
  "weather",
  "rss",
  "qr",
  "ticker",
  "counter",
  "webpage",
  "wifi",
  "audience",
  "customHtml",
];
const actualZoneTypes = manifestSchema.$defs.signageZone.properties.type.enum;
if (JSON.stringify(actualZoneTypes) !== JSON.stringify(expectedZoneTypes))
  throw new Error(`Manifest signage types drifted: ${JSON.stringify(actualZoneTypes)}`);

const apiPath = resolve(root, "protocol/openapi.yaml");
const api = await SwaggerParser.validate(apiPath);
const requiredPaths = [
  "/api/v1/auth/session",
  "/api/v1/auth/setup",
  "/api/v1/auth/login",
  "/api/v1/auth/register",
  "/api/v1/display-capabilities",
  "/api/v1/screens/{screenId}/manifest",
  "/api/v1/uploads",
  "/api/v1/uploads/{uploadId}/chunks/{index}",
  "/api/v1/registration/settings",
  "/api/v1/signage-studio/catalog",
  "/api/v1/signage-studio/elements/preview",
  "/api/v1/signage-studio/layouts",
  "/api/v1/signage-studio/layouts/save-publish",
  "/api/v1/signage-studio/playlists",
  "/api/v1/signage-studio/playlists/save",
  "/api/v1/signage-studio/signs",
  "/api/v1/signage-studio/signs/{id}",
  "/api/v1/signage-studio/assignments/bulk",
  "/api/v1/signage-studio/preview/{screenId}",
  "/api/v1/audience/admin/sessions",
];
const missingPaths = requiredPaths.filter(path => !api.paths[path]);
if (missingPaths.length)
  throw new Error(`OpenAPI is missing active server paths:\n  ${missingPaths.join("\n  ")}`);

const expectedRoles = ["Viewer", "Editor", "App Admin", "Service Admin"];
for (const schemaName of ["User", "UserInput", "UserInvitationInput"]) {
  const roles = api.components.schemas[schemaName].properties.role.enum;
  if (JSON.stringify(roles) !== JSON.stringify(expectedRoles))
    throw new Error(`${schemaName}.role is stale: ${JSON.stringify(roles)}`);
}

const expectedPermissions = [
  "planning.manage",
  "uploads.manage",
  "playback.control",
  "screens.manage",
  "users.manage",
  "app-settings.manage",
  "settings.manage",
  "backups.manage",
  "updates.manage",
];
const permissions = api.components.schemas.Permission.enum;
if (JSON.stringify(permissions) !== JSON.stringify(expectedPermissions))
  throw new Error(`Permission enum is stale: ${JSON.stringify(permissions)}`);

const registrationModes =
  api.components.schemas.RegistrationSettingsInput.properties.mode.enum;
if (JSON.stringify(registrationModes) !==
    JSON.stringify(["closed", "approval", "code", "open"]))
  throw new Error(`Registration mode enum is stale: ${JSON.stringify(registrationModes)}`);

console.log(
  `Protocol contract valid: 2 manifest fixtures, ${Object.keys(api.paths).length} OpenAPI paths, ` +
  `${expectedZoneTypes.length} signage element types, ${expectedRoles.length} roles.`,
);
