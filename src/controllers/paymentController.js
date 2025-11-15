import Transaction from "C:\Ebook\src\models\payment.js";

export const verifyPayment = async (req, res) => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, email, amount } = req.body;

    // Convert to paise for storing
    const amountPaise = amount;

    // Save transaction in DB
    const transaction = new Transaction({
      email,
      amount,
      amountPaise,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      status: "success"
    });

    await transaction.save();

    res.json({ success: true, message: "Payment verified & saved", transaction });
  } catch (error) {
    console.error("Error saving transaction:", error);
    res.status(500).json({ success: false, message: "Failed to save transaction" });
  }
};
