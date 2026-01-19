// src/controllers/paymentController.js
import axios from "axios";
import Transaction from "../models/payment.js";
import Promoter from "../models/promoter.js";

// Reusable RazorpayX Payout Logic
const executePayout = async (upi, amountRupees, name, email, purpose) => {
  try {
    const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
    
    const payoutData = {
      account_number: process.env.RAZORPAYX_ACCOUNT_NUMBER,
      amount: Math.round(amountRupees * 100), // Convert to Paise
      currency: "INR",
      mode: "UPI",
      purpose: "payout",
      fund_account: {
        account_type: "vpa",
        vpa: { address: upi }
      },
      contact: {
        name: name,
        type: "vendor",
        email: email
      },
      queue_if_low_balance: true, // IMPORTANT: Wait for T+2 settlement
      reference_id: `refe_${Date.now()}_${Math.floor(Math.random() * 1000)}`
    };

    await axios.post('https://api.razorpay.com/v1/payouts', payoutData, {
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error(`Payout failed for ${purpose}:`, error.response?.data || error.message);
  }
};

export const verifyPayment = async (req, res) => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, email, amount, couponCode } = req.body;

    // 1. Verify and Save Transaction
    const transaction = new Transaction({
      email,
      amount,
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: razorpayPaymentId,
      status: "success"
    });
    await transaction.save();

    // 2. FETCH COMMISSION LOGIC FROM THE COUPON
    if (couponCode) {
      const couponData = await Promoter.findOne({ refId: couponCode });

      if (couponData && couponData.active) {
        // Payout to Promoter
        if (couponData.promoterCommission > 0) {
          await executePayout(
            couponData.promoterUpi, 
            couponData.promoterCommission, 
            couponData.name, 
            couponData.email, 
            "Promoter Commission"
          );
        }

        // Payout to Ebook Creator
        if (couponData.creatorCommission > 0) {
          await executePayout(
            couponData.creatorUpi, 
            couponData.creatorCommission, 
            "Ebook Creator", 
            "creator@stribble.com", 
            "Creator Earnings"
          );
        }

        // Update Stats
        couponData.totalSales += 1;
        couponData.totalEarned += couponData.promoterCommission;
        await couponData.save();
      }
    }

    res.json({ success: true, message: "Payment verified and Payouts queued" });
  } catch (error) {
    console.error("Critical Error in verifyPayment:", error);
    res.status(500).json({ success: false, message: "Failed to process transaction" });
  }
};