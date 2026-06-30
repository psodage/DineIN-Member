const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const dns = require("dns");
if (typeof dns.setServers === "function") {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
}

const mongoose = require("mongoose");

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set");
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  const newDate = new Date("2026-06-01T00:00:00.000Z");

  // Update all members
  const membersResult = await db
    .collection("members")
    .updateMany({}, { $set: { createdAt: newDate } });
  console.log(
    `Members: matched ${membersResult.matchedCount}, modified ${membersResult.modifiedCount}`
  );

  // Update all users
  const usersResult = await db
    .collection("users")
    .updateMany({}, { $set: { createdAt: newDate } });
  console.log(
    `Users: matched ${usersResult.matchedCount}, modified ${usersResult.modifiedCount}`
  );

  await mongoose.disconnect();
  console.log("Done. All createdAt dates set to June 1, 2026.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
