import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import Coupon from "../src/models/coupon.js";
import Promoter from "../src/models/promoter.js";
import { encrypt, isEncrypted } from "../src/utils/crypto.js";

const MONGO = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/course_selling";

if (!process.env.APP_ENCRYPTION_KEY) {
  throw new Error("APP_ENCRYPTION_KEY is required to encrypt payout UPI fields.");
}

async function run() {
  await mongoose.connect(MONGO);
  console.log("Connected to MongoDB");

  const coupons = await Coupon.find({}).lean();
  let updatedCoupons = 0;
  let skippedCoupons = 0;

  for (const coupon of coupons) {
    const updates = {};

    if (coupon.influencerUpi && !isEncrypted(coupon.influencerUpi)) {
      updates.influencerUpi = encrypt(coupon.influencerUpi);
    }

    if (coupon.creatorUpi && !isEncrypted(coupon.creatorUpi)) {
      updates.creatorUpi = encrypt(coupon.creatorUpi);
    }

    if (Object.keys(updates).length === 0) {
      skippedCoupons++;
      continue;
    }

    await Coupon.updateOne({ _id: coupon._id }, { $set: updates });
    updatedCoupons++;
    console.log("encrypted UPI fields for coupon:", coupon.code);
  }

  const promoters = await Promoter.find({}).lean();
  let updatedPromoters = 0;
  let skippedPromoters = 0;

  for (const promoter of promoters) {
    const updates = {};

    if (promoter.promoterUpi && !isEncrypted(promoter.promoterUpi)) {
      updates.promoterUpi = encrypt(promoter.promoterUpi);
    }

    if (promoter.creatorUpi && !isEncrypted(promoter.creatorUpi)) {
      updates.creatorUpi = encrypt(promoter.creatorUpi);
    }

    if (Object.keys(updates).length === 0) {
      skippedPromoters++;
      continue;
    }

    await Promoter.updateOne({ _id: promoter._id }, { $set: updates });
    updatedPromoters++;
    console.log("encrypted UPI fields for:", promoter.refId);
  }

  console.log("Done.");
  console.log("Coupons updated:", updatedCoupons, "Skipped:", skippedCoupons);
  console.log("Promoters updated:", updatedPromoters, "Skipped:", skippedPromoters);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
