const { test } = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const { writeFileSync, mkdtempSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const CLI = path.join(__dirname, "..", "index.js");

// Run the CLI with the PAC supplied on stdin (-p -). A short timeout means a
// hang (e.g. a DNS lookup that never returns) fails the test instead of
// blocking forever.
function run(pac, args, opts = {}) {
  return spawnSync("node", [CLI, "-p", "-", ...args], {
    input: pac,
    encoding: "utf8",
    timeout: 15000,
    ...opts,
  });
}

function out(pac, args) {
  const res = run(pac, args);
  assert.strictEqual(res.signal, null, `CLI hung or was killed: ${res.signal}`);
  assert.strictEqual(res.status, 0, `non-zero exit: ${res.stderr}`);
  return res.stdout.trim();
}

const ECHO_HOST = "function FindProxyForURL(url, host) { return host; }";

test("-v prints the version", () => {
  const pkg = require("../package.json");
  const res = spawnSync("node", [CLI, "-v"], { encoding: "utf8", timeout: 15000 });
  assert.strictEqual(res.status, 0);
  assert.strictEqual(res.stdout.trim(), pkg.version);
});

test("isPlainHostName routes a bare host to DIRECT", () => {
  const pac =
    "function FindProxyForURL(url, host) {" +
    "  return isPlainHostName(host) ? 'DIRECT' : 'PROXY p:8080';" +
    "}";
  assert.strictEqual(out(pac, ["-u", "http://intranet/x"]), "DIRECT");
  assert.strictEqual(out(pac, ["-u", "http://www.example.com/x"]), "PROXY p:8080");
});

test("dnsDomainIs matches a domain suffix", () => {
  const pac =
    "function FindProxyForURL(url, host) {" +
    "  return dnsDomainIs(host, '.example.com') ? 'MATCH' : 'NOPE';" +
    "}";
  assert.strictEqual(out(pac, ["-u", "http://www.example.com/x"]), "MATCH");
  assert.strictEqual(out(pac, ["-u", "http://www.example.org/x"]), "NOPE");
});

test("shExpMatch supports glob patterns", () => {
  const pac =
    "function FindProxyForURL(url, host) {" +
    "  return shExpMatch(url, '*.example.com/*') ? 'MATCH' : 'NOPE';" +
    "}";
  assert.strictEqual(out(pac, ["-u", "http://a.example.com/path"]), "MATCH");
});

test("isInNet works with literal IPv4 host and mask", () => {
  const pac =
    "function FindProxyForURL(url, host) {" +
    "  return isInNet(host, '10.0.0.0', '255.0.0.0') ? 'IN' : 'OUT';" +
    "}";
  assert.strictEqual(out(pac, ["-h", "10.1.2.3", "-u", "http://10.1.2.3/x"]), "IN");
  assert.strictEqual(out(pac, ["-h", "192.168.1.1", "-u", "http://192.168.1.1/x"]), "OUT");
});

test("host is parsed from a URL with a path but no port", () => {
  // Regression: getHostFromUrl previously returned "" for these URLs.
  assert.strictEqual(out(ECHO_HOST, ["-u", "http://localhost/foo/bar"]), "localhost");
});

test("host is parsed from a URL with an explicit port", () => {
  assert.strictEqual(out(ECHO_HOST, ["-u", "http://localhost:8443/x"]), "localhost");
});

test("explicit -h overrides the host derived from the URL", () => {
  assert.strictEqual(out(ECHO_HOST, ["-h", "override.test", "-u", "http://localhost/x"]), "override.test");
});

test("dnsResolve resolves localhost without a native dependency", () => {
  const pac = "function FindProxyForURL(url, host) { return String(dnsResolve(host)); }";
  const result = out(pac, ["-u", "http://localhost/x"]);
  assert.notStrictEqual(result, "null", "localhost should resolve");
  assert.match(result, /^[0-9a-f:.]+$/i, `unexpected address: ${result}`);
});

test("dnsResolve returns null for an unresolvable host (and does not hang)", () => {
  const pac = "function FindProxyForURL(url, host) { return String(dnsResolve(host)); }";
  assert.strictEqual(out(pac, ["-u", "http://nonexistent.invalid/x"]), "null");
});

test("myIpAddress returns an address", () => {
  const pac = "function FindProxyForURL(url, host) { return myIpAddress(); }";
  const result = out(pac, ["-u", "http://localhost/x"]);
  assert.match(result, /^[0-9a-f:.]+$/i, `unexpected address: ${result}`);
});

test("-f processes a list of URLs and preserves comments", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "pactester-"));
  const urls = path.join(dir, "urls.txt");
  writeFileSync(urls, "http://localhost/a\n# a comment\nhttp://intranet/b\n");

  const pac =
    "function FindProxyForURL(url, host) {" +
    "  return isPlainHostName(host) ? 'DIRECT' : 'PROXY p:8080';" +
    "}";
  const lines = out(pac, ["-f", urls]).split("\n");

  assert.deepStrictEqual(lines, [
    "http://localhost/a : DIRECT",
    "# a comment",
    "http://intranet/b : DIRECT",
  ]);
});
