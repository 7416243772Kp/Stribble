// C:\Ebook\src\routes\orderRoutes.js
import express from "express";
import Order from "../models/order.js";
import Coupon from "../models/coupon.js";
import Course from "../models/course.js";
import {
  buildCashfreeCustomerId,
  buildCashfreeIdempotencyKey,
  buildCashfreeOrderId,
  cashfreeConfigReady,
  createCashfreeOrder,
  getCashfreeMode,
} from "../config/cashfree.js";

const router = express.Router();

function getPublicBaseUrl(req) {
  return String(
    process.env.PUBLIC_BASE_URL ||
    process.env.FRONTEND_URL ||
    `${req.protocol}://${req.get("host")}`
  ).replace(/\/$/, "");
}

// Checkout Route (Generate Cashfree Order)
router.post("/checkout", async (req, res) => {
  try {
    const { email, courseId, couponCode } = req.body;

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    let coupon = null;
    const code = String(couponCode || "").trim().toUpperCase();
    if (code) {
      coupon = await Coupon.findOne({ code, courseId, isActive: true });
      if (!coupon) {
        return res.status(400).json({ error: "Invalid coupon for this course" });
      }
    }

    if (!cashfreeConfigReady()) {
      return res.status(500).json({ success: false, message: "Cashfree credentials are not configured" });
    }

    const discount = Number((coupon && (coupon.discountValue || coupon.discount)) || 0);
    const finalAmount = Math.max(1, Number(course.price) - discount);
    const influencerCommission = Number((coupon && coupon.influencerCommission) || 0);
    const ebookCreatorCommission = Number((coupon && (coupon.creatorCommission || coupon.ebookCreatorCommission)) || 0);
    const ownerAmount = finalAmount - influencerCommission - ebookCreatorCommission;
    if (ownerAmount < 0) return res.status(400).json({ error: "Commission exceeds price after discount" });

    const cashfreeOrderId = buildCashfreeOrderId();
    const baseUrl = getPublicBaseUrl(req);
    const cashfreeOrder = await createCashfreeOrder({
      order_id: cashfreeOrderId,
      order_amount: Number(finalAmount.toFixed(2)),
      order_currency: "INR",
      customer_details: {
        customer_id: buildCashfreeCustomerId(email),
        customer_email: email,
        customer_phone: process.env.CASHFREE_DEFAULT_CUSTOMER_PHONE || "9999999999",
      },
      order_meta: {
        return_url: `${baseUrl}/checkout/${courseId}?cashfree_order_id=${encodeURIComponent(cashfreeOrderId)}`,
        notify_url: process.env.CASHFREE_NOTIFY_URL || `${baseUrl}/api/payment/webhook/cashfree`,
      },
    }, buildCashfreeIdempotencyKey());

    const newOrder = await Order.create({
      buyerEmail: email,
      courseId,
      couponId: coupon ? coupon._id : null,
      influencerCommission,
      ebookCreatorCommission,
      ownerAmount,
      paymentProvider: "cashfree",
      paymentOrderId: cashfreeOrder.order_id,
      cashfreeOrderId: cashfreeOrder.order_id,
      cashfreeCfOrderId: cashfreeOrder.cf_order_id,
      cashfreePaymentSessionId: cashfreeOrder.payment_session_id,
      cashfreeOrderStatus: cashfreeOrder.order_status,
      status: "pending",
    });

    res.status(201).json({
      success: true,
      msg: "Order created, proceed to payment",
      order: newOrder,
      provider: "cashfree",
      orderId: cashfreeOrder.order_id,
      paymentSessionId: cashfreeOrder.payment_session_id,
      cashfreeMode: getCashfreeMode(),
    });
  } catch (error) {
    console.error("Checkout Error:", error?.response?.data || error);
    res.status(500).json({ error: "Error during checkout" });
  }
});

export default router;
