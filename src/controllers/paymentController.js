import axios from 'axios';
import Transaction from '../models/payment.js';
import Coupon from '../models/coupon.js';

// Helper function for RazorpayX Payout
const executePayout = async (upi, amountRupees, purpose) => {
  if (!upi || amountRupees <= 0) return;

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
      name: purpose === "Influencer" ? "Influencer Partner" : "Ebook Creator",
      type: "vendor"
    },
    queue_if_low_balance: true, // IMPORTANT: Wait for T+2 settlement
    reference_id: `stribble_${Date.now()}_${Math.floor(Math.random() * 1000)}`
  };

  try {
    await axios.post('https://api.razorpay.com/v1/payouts', payoutData, {
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' }
    });
    console.log(`${purpose} payout queued successfully.`);
  } catch (error) {
    console.error(`${purpose} payout failed:`, error.response?.data || error.message);
  }
};

export const verifyPayment = async (req, res) => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, email, amount, couponCode } = req.body;

    // 1. Verify & Save transaction
    const transaction = new Transaction({
      email, amount, 
      razorpay_payment_id: razorpayPaymentId, 
      status: "success"
    });
    await transaction.save();

    // 2. Automated Dual Payouts
    if (couponCode) {
      const coupon = await Coupon.findOne({ code: couponCode });
      
      if (coupon && coupon.isActive) {
        // Trigger Payout for Influencer
        await executePayout(coupon.influencerUpi, coupon.influencerCommission, "Influencer");
        
        // Trigger Payout for Ebook Creator
        await executePayout(coupon.creatorUpi, coupon.creatorCommission, "Creator");

        // Update coupon stats
        coupon.usageCount += 1;
        await coupon.save();
      }
    }

    res.json({ success: true, message: "Payment verified and payouts scheduled" });
  } catch (error) {
    console.error("Payment Verification Error:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};