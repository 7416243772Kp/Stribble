//C:\Ebook\src\config\razorpay.js
import Razorpay from "razorpay";
import dotenv from "dotenv";

dotenv.config();

// Debugging: Check if keys are loaded
console.log("KEY_ID:", process.env.RAZORPAY_KEY_ID);
console.log("KEY_SECRET:", process.env.RAZORPAY_KEY_SECRET);

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

export default razorpay;
