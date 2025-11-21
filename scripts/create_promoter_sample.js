// scripts/archive/create_promoter_sample.js
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import Promoter from "../src/models/promoter.js";

async function main() {
  await mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/course_selling", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  // create an example promoter if not exists
  const refId = Promoter.generateRefId("prom");

  const existing = await Promoter.findOne({ email: "alice@promoters.example" }).exec();
  if (existing) {
    console.log("Sample promoter already exists:", existing.refId);
    process.exit(0);
  }

  const p = new Promoter({
    refId,
    name: "Alice Promoter",
    email: "alice@promoters.example",
    upi: "alice@upi",
    defaultCoupon: "PROMO_ALICE",
    active: true,
  });

  await p.save();
  console.log("Created sample promoter:", p.refId, "coupon:", p.defaultCoupon);
  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
