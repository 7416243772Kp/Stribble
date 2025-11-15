//C:\Ebook\scripts\migrate-encrypt-totp.js
import dotenv from "dotenv";
dotenv.config(); // <- important: load env first

import mongoose from "mongoose";
import AdminUser from "../src/models/AdminUser.js"; // adjust path if needed
import { encrypt, isEncrypted } from "../src/utils/crypto.js";

const MONGO = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/yourdb";

async function run() {
  await mongoose.connect(MONGO, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log("Connected to MongoDB");

  const admins = await AdminUser.find({});
  let updated = 0;
  for (const a of admins) {
    if (!a.totpSecret) continue;
    if (isEncrypted(a.totpSecret)) {
      console.log("already encrypted:", a.email);
      continue;
    }
    a.totpSecret = encrypt(a.totpSecret);
    await a.save();
    console.log("encrypted for:", a.email);
    updated++;
  }

  console.log("Done. Updated:", updated);
  await mongoose.disconnect();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
