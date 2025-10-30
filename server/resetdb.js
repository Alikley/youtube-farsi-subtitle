// server/resetUsage.js
import { runSQLite } from "./database.js";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
// usage: node resetUsage.js --user test_user_01
// or:   node resetUsage.js --all

async function main() {
  if (args.length === 0) {
    console.log("Usage: node resetUsage.js --user <userId> | --all");
    process.exit(1);
  }

  if (args[0] === "--all") {
    await runSQLite(`UPDATE user_usage SET seconds_used = 0;`);
    console.log("✅ All user usage reset to 0.");
    process.exit(0);
  }

  if (args[0] === "--user" && args[1]) {
    const userId = args[1].replace(/'/g, "''");
    await runSQLite(
      `UPDATE user_usage SET seconds_used = 0 WHERE user_id='${userId}';`
    );
    console.log(`✅ Usage reset to 0 for user: ${userId}`);
    process.exit(0);
  }

  console.log("Invalid args.");
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
