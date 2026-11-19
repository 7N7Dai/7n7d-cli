#!/usr/bin/env node
// Check the RPC endpoint this package publishes.
//
// The quickstart in .env.example and README.md is the only onboarding
// surface for this package, so a dead endpoint published there makes
// every new user's first RPC call fail with an opaque transport error.
// This script fails the build when the published URL points at an
// endpoint that is known to be gone.
//
// Usage:
//   node scripts/check-published-rpc.mjs         # deterministic (no network)
//   node scripts/check-published-rpc.mjs --live  # also probe eth_chainId

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Endpoints that answered HTTP 404 instead of JSON-RPC when this list
// was written. A host lands here when it stops serving JSON-RPC.
const DEAD_HOSTS = new Set([
  "rpc.sepolia.org",
]);

// The files a user copies from. A published endpoint that is not in
// one of these is not part of the onboarding surface.
const PUBLISHED = [".env.example", "README.md"];

function extractUrls(text) {
  const urls = text.match(/https?:\/\/[^\s'"`)]+/g) || [];
  return urls.map((u) => u.replace(/[.,;]+$/, ""));
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

async function chainId(url) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_chainId",
      params: [],
    }),
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const body = await res.json();
  if (body.error) throw new Error(body.error.message || "JSON-RPC error");
  return body.result;
}

const live = process.argv.includes("--live");
const failures = [];
const found = [];

for (const rel of PUBLISHED) {
  const text = readFileSync(join(ROOT, rel), "utf8");
  for (const url of extractUrls(text)) {
    const host = hostOf(url);
    if (!host) continue;
    found.push(rel + " -> " + url);
    if (DEAD_HOSTS.has(host)) {
      failures.push(
        rel +
        " publishes " +
        url +
        " (host " +
        host +
        " is a known-dead endpoint)"
      );
    }
    if (live && /sepolia/i.test(host)) {
      try {
        const id = await chainId(url);
        console.log("live probe OK " + url + " chainId=" + id);
      } catch (error) {
        failures.push(
          rel +
          " publishes " +
          url +
          " which did not answer eth_chainId: " +
          error.message
        );
      }
    }
  }
}

for (const line of found) console.log("published " + line);
if (failures.length) {
  for (const line of failures) console.error("FAIL " + line);
  process.exit(2);
}
console.log("published RPC endpoints OK");