#!/usr/bin/env node

import { mkdir, rm } from "node:fs/promises";

const target = process.argv[2] ?? "/tmp/lessoncue-e2e";
if (!/^\/tmp\/lessoncue-e2e(?:-[A-Za-z0-9_.-]+)?$/.test(target)) {
  throw new Error("The E2E data path must be a dedicated /tmp/lessoncue-e2e[-suffix] directory.");
}
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
