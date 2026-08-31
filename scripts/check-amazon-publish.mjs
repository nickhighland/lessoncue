// The Amazon publisher, played against a stand-in Appstore.
//
// The real one cannot be exercised from here: it needs a developer account, a
// live app, and every run submits something for review. So the sequence it must
// follow — open an edit, put the APK in it, commit with the right ETag — is
// checked against a server that behaves the way Amazon's specification says
// theirs does, and refuses anything else.
//
// This is not proof it works against Amazon. It is proof the script does what
// the documented API asks, which is the part that is ours to get right.
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };

const APP_ID = "amzn1.devportal.mobileapp.test";
const APK_BYTES = Buffer.from("PK pretend this is a signed apk");

/** One run of the publisher against a stand-in, returning what it did. */
async function publish({ existingApks, editAlreadyOpen = false }) {
  const seen = [];
  let committed = null;
  let uploadedBytes = null;

  const server = createServer((request, response) => {
    const { method, url } = request;
    const chunks = [];
    request.on("data", chunk => chunks.push(chunk));
    request.on("end", () => {
      const body = Buffer.concat(chunks);
      seen.push({ method, url, ifMatch: request.headers["if-match"], fileName: request.headers["filename"] });
      const send = (status, payload, headers = {}) => {
        response.writeHead(status, { "Content-Type": "application/json", ...headers });
        response.end(payload === undefined ? "" : JSON.stringify(payload));
      };

      if (url === "/auth/o2/token") {
        const form = new URLSearchParams(body.toString());
        check(form.get("grant_type") === "client_credentials", "the token request must use client_credentials");
        check(form.get("scope") === "appstore::apps:readwrite", "the token request must ask for the appstore scope");
        return send(200, { access_token: "Atc|stub", expires_in: 3600 });
      }

      // Everything past here must carry the token.
      if (request.headers.authorization !== "Bearer Atc|stub") return send(401, { error: "no token" });

      const base = `/api/appstore/v1/applications/${APP_ID}/edits`;
      if (url === base && method === "GET") {
        return editAlreadyOpen || seen.some(call => call.url === base && call.method === "POST")
          ? send(200, { id: "edit-1", status: "IN_PROGRESS" }, { ETag: "edit-etag-2" })
          : send(200, "", { ETag: "edit-etag-0" });
      }
      if (url === base && method === "POST") return send(200, { id: "edit-1", status: "IN_PROGRESS" }, { ETag: "edit-etag-1" });
      if (url === `${base}/edit-1/apks` && method === "GET") return send(200, existingApks);
      if (url === `${base}/edit-1/apks/apk-9` && method === "GET") {
        return send(200, { id: "apk-9", versionCode: 139, name: "old.apk" }, { ETag: "apk-etag-1" });
      }
      if (url === `${base}/edit-1/apks/apk-9/replace` && method === "PUT") {
        if (request.headers["if-match"] !== "apk-etag-1") return send(412, { error: "stale etag" });
        uploadedBytes = body;
        return send(200, { id: "apk-9", versionCode: 140 });
      }
      if (url === `${base}/edit-1/apks/upload` && method === "POST") {
        uploadedBytes = body;
        return send(200, { id: "apk-new", versionCode: 140 });
      }
      if (url === `${base}/edit-1/commit` && method === "POST") {
        // Amazon refuses a commit carrying an ETag from before the upload.
        if (request.headers["if-match"] !== "edit-etag-2") return send(412, { error: "stale edit etag" });
        committed = true;
        return send(200, { id: "edit-1", status: "SUBMITTED" });
      }
      return send(404, { error: `no stub for ${method} ${url}` });
    });
  });

  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const work = mkdtempSync(join(tmpdir(), "amazon-publish-"));
  const apk = join(work, "LessonCue-TV-store.apk");
  writeFileSync(apk, APK_BYTES);

  const run = spawnSync("bash", ["scripts/publish-amazon-appstore.sh", apk], {
    encoding: "utf8",
    env: {
      ...process.env,
      AMAZON_CLIENT_ID: "client",
      AMAZON_CLIENT_SECRET: "secret",
      AMAZON_APP_ID: APP_ID,
      AMAZON_API_BASE: `http://127.0.0.1:${port}/api/appstore/v1`,
      AMAZON_TOKEN_URL: `http://127.0.0.1:${port}/auth/o2/token`,
    },
  });

  rmSync(work, { recursive: true, force: true });
  await new Promise(resolve => server.close(resolve));
  return { run, seen, committed, uploadedBytes };
}

// ── A version going out over an app that already has one.
{
  const { run, seen, committed, uploadedBytes } = await publish({
    existingApks: [{ id: "apk-9", versionCode: 139, name: "old.apk" }],
  });
  check(run.status === 0, `publishing failed: ${run.stderr || run.stdout}`);
  check(committed === true, "the edit was never committed, so nothing would reach review");
  check(uploadedBytes?.equals(APK_BYTES) === true, "the bytes Amazon received were not the APK we passed in");
  // Replacing rather than adding: a second APK would leave the old one live
  // beside it, and lose the device targeting set in the Console.
  check(seen.some(call => call.url.endsWith("/apks/apk-9/replace") && call.method === "PUT"),
    "an app with an existing APK must have it replaced, not added to");
  check(!seen.some(call => call.url.endsWith("/apks/upload")),
    "nothing should be uploaded as a new APK when one is already there");
  check(seen.some(call => call.fileName === "LessonCue-TV-store.apk"),
    "the upload must name the file, which is what appears in the Console");
  check(!/Atc\|stub|secret/.test(`${run.stdout}${run.stderr}`),
    "the token or the client secret was printed");
}

// ── An edit left open by a run that uploaded and then failed to commit.
{
  const { run, committed } = await publish({
    existingApks: [{ id: "apk-9", versionCode: 139, name: "old.apk" }],
    editAlreadyOpen: true,
  });
  check(run.status === 0, `an already-open edit should be reused, not fatal: ${run.stderr}`);
  check(committed === true, "reusing an open edit must still end in a commit");
  check(/Reusing the edit/.test(run.stdout), "reusing somebody's open edit should say so");
}

// ── An edit with no APK in it yet.
{
  const { run, seen, committed } = await publish({ existingApks: [] });
  check(run.status === 0, `first upload failed: ${run.stderr}`);
  check(seen.some(call => call.url.endsWith("/apks/upload") && call.method === "POST"),
    "with no APK present the new one has to be uploaded");
  check(committed === true, "a first upload must still be committed");
}

// ── More than one APK is a choice a person has to make.
{
  const { run, committed } = await publish({
    existingApks: [{ id: "apk-9", versionCode: 139 }, { id: "apk-8", versionCode: 138 }],
  });
  check(run.status !== 0, "several APKs should stop the release rather than guess which to replace");
  check(committed === null, "nothing should be committed when the script does not know what to replace");
}

if (failures.length) {
  console.error("Amazon publish check failed:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log("Amazon publish valid: opens an edit, replaces the APK, commits with a fresh ETag, and keeps its credentials quiet.");
