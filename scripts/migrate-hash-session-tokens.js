import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import User, { hashSessionToken } from "../src/models/User.js";

const MONGO = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/course_selling";
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/i;

async function run() {
  await mongoose.connect(MONGO);
  console.log("Connected to MongoDB");

  const users = await User.find({
    activeSessionToken: { $exists: true, $nin: [null, ""] },
  }).lean();

  let updated = 0;
  let skipped = 0;

  for (const user of users) {
    if (SHA256_HEX_PATTERN.test(user.activeSessionToken)) {
      skipped++;
      continue;
    }

    await User.updateOne(
      { _id: user._id },
      { $set: { activeSessionToken: hashSessionToken(user.activeSessionToken) } }
    );

    updated++;
    console.log("hashed active session token for:", user.email);
  }

  console.log("Done. Updated:", updated, "Skipped:", skipped);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
