import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRelayTunnelCommand,
  extractCloudflareQuickTunnelPublicUrl,
  extractRelayTunnelPublicUrl,
  isUnavailableTunnelBinaryError,
  isRelayTunnelProvider,
  toTailscalePrerequisiteError,
} from "./tunnel.js";

test("buildRelayTunnelCommand uses tailscale funnel in background mode", () => {
  const plan = buildRelayTunnelCommand({
    provider: "tailscale",
    localPort: 8787,
    localUrl: "http://127.0.0.1:8787",
  });

  assert.equal(plan.command, "tailscale");
  assert.deepEqual(plan.args, ["funnel", "--bg", "8787"]);
});

test("buildRelayTunnelCommand uses a Cloudflare quick tunnel", () => {
  const plan = buildRelayTunnelCommand({
    provider: "cloudflare",
    localPort: 8787,
    localUrl: "http://127.0.0.1:8787",
  });

  assert.equal(plan.command, "cloudflared");
  assert.deepEqual(plan.args, ["tunnel", "--url", "http://127.0.0.1:8787"]);
});

test("extractRelayTunnelPublicUrl reads the first public https URL", () => {
  assert.equal(
    extractRelayTunnelPublicUrl(
      "Available on https://relay-demo.trycloudflare.com after startup.",
    ),
    "https://relay-demo.trycloudflare.com",
  );
  assert.equal(
    extractRelayTunnelPublicUrl(
      "Listening at https://my-device.my-tailnet.ts.net/ for HTTPS traffic",
    ),
    "https://my-device.my-tailnet.ts.net/",
  );
});

test("extractCloudflareQuickTunnelPublicUrl ignores disclaimer links", () => {
  const output = `
2026-03-17T02:54:37Z INF Thank you for trying Cloudflare Tunnel. Doing so, without a Cloudflare account, is a quick way to experiment and try it out. However, be aware that these account-less Tunnels have no uptime guarantee, are subject to the Cloudflare Online Services Terms of Use (https://www.cloudflare.com/website-terms/), and Cloudflare reserves the right to investigate your use of Tunnels for violations of such terms. If you intend to use Tunnels in production you should use a pre-created named tunnel by following: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps
2026-03-17T02:54:37Z INF Requesting new quick Tunnel on trycloudflare.com...
2026-03-17T02:54:40Z INF +--------------------------------------------------------------------------------------------+
2026-03-17T02:54:40Z INF |  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |
2026-03-17T02:54:40Z INF |  https://privateclaw-demo.trycloudflare.com                                                |
2026-03-17T02:54:40Z INF +--------------------------------------------------------------------------------------------+
`;

  assert.equal(
    extractCloudflareQuickTunnelPublicUrl(output),
    "https://privateclaw-demo.trycloudflare.com",
  );
});

test("isRelayTunnelProvider only accepts supported public tunnel providers", () => {
  assert.equal(isRelayTunnelProvider("tailscale"), true);
  assert.equal(isRelayTunnelProvider("cloudflare"), true);
  assert.equal(isRelayTunnelProvider("ngrok"), false);
});

test("isUnavailableTunnelBinaryError accepts missing and inaccessible CLI errors", () => {
  assert.equal(
    isUnavailableTunnelBinaryError({ code: "ENOENT" }),
    true,
  );
  assert.equal(
    isUnavailableTunnelBinaryError({ code: "EACCES" }),
    true,
  );
  assert.equal(
    isUnavailableTunnelBinaryError({ code: "EPERM" }),
    true,
  );
  assert.equal(
    isUnavailableTunnelBinaryError({ code: "EPIPE" }),
    false,
  );
});

test("toTailscalePrerequisiteError explains logged-out tailscale state", () => {
  const error = toTailscalePrerequisiteError(
    new Error("Command `tailscale funnel --bg 8787` exited with code 1: Logged out."),
  );

  assert.equal(error?.provider, "tailscale");
  assert.match(error?.message ?? "", /not logged in/);
  assert.match(error?.message ?? "", /tailscale reported: Logged out\./);
});
