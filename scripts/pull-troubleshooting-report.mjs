#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const reportUrl = process.env.LESSONCUE_REPORT_URL?.trim();
const token = process.env.LESSONCUE_TROUBLESHOOTING_REPORT_TOKEN?.trim();
const statePath = resolve(
  process.env.LESSONCUE_REPORT_STATE_PATH?.trim() || ".lessoncue-report/state.json",
);
const reportPath = resolve(
  process.env.LESSONCUE_REPORT_OUTPUT_PATH?.trim() || ".lessoncue-report/report.json",
);

function fail(code, message) {
  console.error(code + ": " + message);
  process.exitCode = 2;
}

if (!reportUrl) {
  fail("LC.REPORT.CLIENT.CONFIGURATION_MISSING", "Set LESSONCUE_REPORT_URL.");
} else if (!token) {
  fail(
    "LC.REPORT.CLIENT.CONFIGURATION_MISSING",
    "Set LESSONCUE_TROUBLESHOOTING_REPORT_TOKEN in the Codex task environment.",
  );
} else {
  let previous = {};
  try {
    previous = JSON.parse(await readFile(statePath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") {
      fail("LC.REPORT.CLIENT.STATE_UNREADABLE", "The saved report state is not valid JSON.");
    }
  }

  if (process.exitCode !== 2) {
    const headers = {
      Authorization: "Bearer " + token,
      Accept: "application/json",
    };
    if (previous.etag) headers["If-None-Match"] = previous.etag;

    try {
      const response = await fetch(reportUrl, {
        method: "GET",
        headers,
        redirect: "error",
      });

      if (response.status === 304) {
        console.log(JSON.stringify({
          status: "unchanged",
          etag: previous.etag || null,
          reportPath,
        }));
      } else if (!response.ok) {
        const detail = (await response.text()).replace(/\s+/g, " ").slice(0, 500);
        fail(
          "LC.REPORT.CLIENT.HTTP_" + response.status,
          detail || "The report endpoint returned an error.",
        );
      } else {
        const body = await response.text();
        let report;
        try {
          report = JSON.parse(body);
        } catch {
          fail("LC.REPORT.CLIENT.INVALID_JSON", "The report endpoint did not return valid JSON.");
        }
        if (process.exitCode !== 2 && (!report || typeof report !== "object")) {
          fail("LC.REPORT.CLIENT.INVALID_REPORT", "The report response was not an object.");
        }
        if (process.exitCode !== 2) {
          const etag = response.headers.get("etag");
          await mkdir(dirname(reportPath), { recursive: true });
          await mkdir(dirname(statePath), { recursive: true });
          const reportTemporary = reportPath + ".tmp-" + process.pid;
          const stateTemporary = statePath + ".tmp-" + process.pid;
          await writeFile(reportTemporary, JSON.stringify(report, null, 2) + "\n", "utf8");
          await rename(reportTemporary, reportPath);
          await writeFile(
            stateTemporary,
            JSON.stringify({
              etag,
              generatedAt: report.generatedAt || null,
              fetchedAt: new Date().toISOString(),
              reportPath,
            }, null, 2) + "\n",
            "utf8",
          );
          await rename(stateTemporary, statePath);
          console.log(JSON.stringify({
            status: "updated",
            etag,
            generatedAt: report.generatedAt || null,
            issueCount: Array.isArray(report.issues) ? report.issues.length : null,
            reportPath,
          }));
        }
      }
    } catch (error) {
      fail(
        "LC.REPORT.CLIENT.NETWORK_FAILED",
        error instanceof Error ? error.message : "The report endpoint could not be reached.",
      );
    }
  }
}
