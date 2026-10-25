// Serves Nocturne on your local network so you can open it on your phone
// (same Wi-Fi). Usage:
//   npm run phone            # development server (hot reload)
//   npm run phone -- --prod  # production build: faster on the phone
import { spawn } from "node:child_process";
import { networkInterfaces } from "node:os";

const prod = process.argv.includes("--prod");
const port = process.env.PORT ?? "3000";

const addresses = Object.values(networkInterfaces())
  .flat()
  .filter((a) => a && a.family === "IPv4" && !a.internal)
  .map((a) => a.address);

const supabase = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

console.log("\n  Nocturne on your phone");
console.log("  ──────────────────────");
if (addresses.length) {
  for (const ip of addresses) console.log(`  Open on your phone:  http://${ip}:${port}`);
} else {
  console.log("  Couldn't detect a network address. Is this computer on Wi-Fi?");
}
console.log("  Your phone must be on the same Wi-Fi network as this computer.");
console.log("  Then use “Add to Home Screen” (Safari share menu / Chrome ⋮ menu) to get the app icon.");
if (!supabase) {
  console.log("\n  ⚠ Local mode: there is no sign-in, so anyone on this network who opens the");
  console.log("    address shares your single local user (and your AI credits). Use a trusted network.");
}
console.log("");

const run = (args, env = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn("npx", ["next", ...args], {
      stdio: "inherit",
      shell: process.platform === "win32",
      env: { ...process.env, ...env },
    });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`next ${args[0]} exited with ${code}`))));
  });

try {
  if (prod) {
    await run(["build"]);
    await run(["start", "-H", "0.0.0.0", "-p", port], supabase ? {} : { NOCTURNE_ALLOW_LOCAL_MODE: "true" });
  } else {
    await run(["dev", "-H", "0.0.0.0", "-p", port], { NOCTURNE_PHONE_DEV: "1", NOCTURNE_DEV_ORIGINS: addresses.join(",") });
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
