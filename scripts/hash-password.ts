/**
 * Prompts for the admin password (input hidden) and prints the line to put
 * in .env.local. The password itself is never written anywhere.
 *
 *   npm run hash-password
 */
import { hashPassword } from "../src/lib/password.ts";

const MIN_LENGTH = 12;

function readHidden(prompt: string): Promise<string> {
  const { stdin, stdout } = process;
  if (!stdin.isTTY) {
    throw new Error("Run this in an interactive terminal so the password is not echoed.");
  }
  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");

  return new Promise((resolve, reject) => {
    let value = "";
    const done = (fn: () => void) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off("data", onData);
      stdout.write("\n");
      fn();
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") return done(() => resolve(value));
        if (ch === "\u0003") return done(() => reject(new Error("Cancelled.")));
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

try {
  const first = await readHidden("Admin password: ");
  if (first.length < MIN_LENGTH) {
    console.error(`Use at least ${MIN_LENGTH} characters.`);
    process.exit(1);
  }
  const second = await readHidden("Repeat password: ");
  if (first !== second) {
    console.error("The passwords do not match.");
    process.exit(1);
  }
  console.log("\nAdd this line to .env.local:\n");
  console.log(`ADMIN_PASSWORD_HASH=${await hashPassword(first)}`);
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
