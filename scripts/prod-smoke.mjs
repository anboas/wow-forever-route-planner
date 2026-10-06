import assert from "node:assert/strict";

const baseUrl = new URL(process.argv[2] || "https://wow-forever-route-planner.pages.dev/");
const response = await fetch(baseUrl);
assert.equal(response.status, 200);
const html = await response.text();
assert.match(html, /Forever Route Planner/);
const asset = html.match(/src="([^"]+\.js)"/)?.[1];
assert.ok(asset, "missing compiled JavaScript asset");
const assetResponse = await fetch(new URL(asset, baseUrl));
assert.equal(assetResponse.status, 200);
assert.ok(Number(assetResponse.headers.get("content-length") || 1) > 0);
process.stdout.write(`Production smoke passed for ${baseUrl}\n`);
