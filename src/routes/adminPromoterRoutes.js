// src/routes/adminPromoterRoutes.js
import express from "express";
import Promoter from "../models/promoter.js";
import PromoterPayout from "../models/promoterPayout.js";
import Order from "../models/order.js";
import mongoose from "mongoose";

const router = express.Router();

// List promoters (with optional search)
router.get("/", async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    const filter = {};
    if (q) {
      filter.$or = [
        { name: { $regex: q, $options: "i" } },
        { email: { $regex: q, $options: "i" } },
        { refId: { $regex: q, $options: "i" } },
      ];
    }
    const promoters = await Promoter.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ success: true, promoters });
  } catch (err) {
    console.error("Promoter list failed", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Create promoter
router.post("/", async (req, res) => {
  try {
    const { name, email, upi, defaultCoupon, refId } = req.body;
    let chosenRef = refId && String(refId).trim() || Promoter.generateRefId("prom");
    // ensure unique
    const exists = await Promoter.findOne({ refId: chosenRef }).lean();
    if (exists) return res.status(400).json({ success: false, message: "refId already exists" });

    const p = new Promoter({
      refId: chosenRef,
      name: name || "Unnamed",
      email: email || "",
      upi: upi || "",
      defaultCoupon: defaultCoupon || "",
      active: true,
    });
    await p.save();
    res.json({ success: true, promoter: p });
  } catch (err) {
    console.error("Create promoter failed", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Update promoter
router.put("/:refId", async (req, res) => {
  try {
    const { refId } = req.params;
    const updates = req.body || {};
    const p = await Promoter.findOneAndUpdate({ refId }, { $set: updates }, { new: true }).exec();
    if (!p) return res.status(404).json({ success: false, message: "Promoter not found" });
    res.json({ success: true, promoter: p });
  } catch (err) {
    console.error("Update promoter failed", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Disable / enable promoter
router.post("/:refId/toggle", async (req, res) => {
  try {
    const { refId } = req.params;
    const p = await Promoter.findOne({ refId }).exec();
    if (!p) return res.status(404).json({ success: false, message: "Promoter not found" });
    p.active = !p.active;
    await p.save();
    res.json({ success: true, promoter: p });
  } catch (err) {
    console.error("Toggle promoter failed", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


// Reporting endpoint: conversions by promoter over range
// GET /report?days=7 or ?from=2025-01-01&to=2025-01-07
router.get("/report", async (req, res) => {
  try {
    const days = parseInt(req.query.days || "7", 10);
    const to = req.query.to ? new Date(req.query.to) : new Date();
    let from;
    if (req.query.from) from = new Date(req.query.from);
    else {
      from = new Date(to);
      from.setDate(from.getDate() - (isNaN(days) ? 7 : days));
    }

    // aggregate orders grouped by referrer
    const agg = [
      { $match: { status: "completed", referrer: { $ne: null }, paidAt: { $gte: from, $lte: to } } },
      { $group: { _id: "$referrer", sales: { $sum: 1 }, totalCommission: { $sum: { $ifNull: ["$promoterCommission", "$influencerCommission"] } }, totalAmount: { $sum: "$ownerAmount" } } },
      { $lookup: { from: "promoters", localField: "_id", foreignField: "refId", as: "promoter" } },
      { $unwind: { path: "$promoter", preserveNullAndEmptyArrays: true } },
      { $project: { refId: "$_id", sales: 1, totalCommission: 1, totalAmount: 1, promoterName: "$promoter.name", promoterEmail: "$promoter.email", payoutBalance: "$promoter.payoutBalance" } },
      { $sort: { sales: -1 } }
    ];

    const rows = await Order.aggregate(agg).allowDiskUse(true).exec();
    res.json({ success: true, from: from.toISOString(), to: to.toISOString(), rows });
  } catch (err) {
    console.error("Promoter report failed", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
