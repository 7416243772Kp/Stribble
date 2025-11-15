// src/controllers/paymentController.js
import Transaction from "../models/payment.js"; // relative path (adjust depending on file location)

export const verifyPayment = async (req, res) => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, email, amount, courseId } = req.body;

    // convert or normalize names if needed; ensure your frontend sends matching keys
    const transaction = new Transaction({
      email,
      courseId,
      amount,
      razorpay_order_id: razorpayOrderId || req.body.razorpay_order_id,
      razorpay_payment_id: razorpayPaymentId || req.body.razorpay_payment_id,
      razorpay_signature: razorpaySignature || req.body.razorpay_signature,
      status: "success"
    });

    await transaction.save();

    res.json({ success: true, message: "Payment verified & saved", transaction });
  } catch (error) {
    console.error("Error saving transaction:", error);
    res.status(500).json({ success: false, message: "Failed to save transaction" });
  }
};
