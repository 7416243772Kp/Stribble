import axios from "axios";
import Promoter from "../models/promoter.js";

export const executeRazorpayXPayout = async (refId, amountInRupees) => {
  const promoter = await Promoter.findOne({ refId });
  if (!promoter || !promoter.upi) throw new Error("Promoter UPI not found");

  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");

  const payoutData = {
    account_number: process.env.RAZORPAYX_ACCOUNT_NUMBER, // Your RazorpayX account
    amount: amountInRupees * 100, // Convert to paise
    currency: "INR",
    mode: "UPI",
    purpose: "payout",
    fund_account: {
      account_type: "vpa",
      vpa: { address: promoter.upi } // Promoter's UPI ID
    },
    contact: {
      name: promoter.name,
      type: "vendor",
      email: promoter.email
    },
    queue_if_low_balance: true // Queues payout if your account is empty
  };

  await axios.post("https://api.razorpay.com/v1/payouts", payoutData, {
    headers: { 
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json"
    }
  });
};