import dotenv from "dotenv";
// 1. Load environment variables IMMEDIATELY, before anything else
dotenv.config();

import nodemailer from "nodemailer";
import Course from "../models/course.js";

// Configuration
const FROM_EMAIL = process.env.SES_FROM_EMAIL || "no-reply@stribble.site";

// Create reusable transporter object using SMTP2GO
export const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "mail.smtp2go.com",
  port: parseInt(process.env.SMTP_PORT || "587"),
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function sendPaymentEmail(opts = {}) {
  const {
    to,
    customerName = "",
    courseId = null,
    courseName = "",
    amount,
    orderId,
    paymentId,
    dateTime,
    downloadLink: dlFromOpts = null,
    supportEmail = "support@stribble.site",
  } = opts || {};

  if (!to) throw new Error("Missing 'to' email address");

  let downloadLink = dlFromOpts || null;
  if (!downloadLink && courseId) {
    try {
      const course = await Course.findById(courseId).select("+googleDriveLink").lean();
      downloadLink = course?.googleDriveLink || null;
    } catch (e) {
      console.warn("sendPaymentEmail: failed to load course by id:", e);
    }
  }

  // --- STRIBBLE BRANDED EMAIL TEMPLATE ---
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Course Access</title>
  <style>
    body { margin: 0; padding: 0; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; }
    table { border-collapse: collapse; width: 100%; }
    a { color: #3b82f6; text-decoration: none; }
    .btn:hover { opacity: 0.9; }
    .logo { display: flex; align-items: center; gap: 12px; }
    .logo div { width: 24px; height: 24px; background-color: #0f172a; border-radius: 6px; }
    .logo div::before { content: ''; width: 8px; height: 8px; background-color: #ffffff; border-radius: 50%; position: absolute; top: 6px; left: 6px; }
    .header { background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; margin-top: 20px; padding: 30px 40px; }
    .content { padding: 40px; }
    .footer { padding: 30px; background-color: #ffffff; border-top: 1px solid #e2e8f0; text-align: center; color: #94a3b8; font-size: 13px; }
    .footer a { color: #0f172a; font-weight: 600; text-decoration: underline; }
    .receipt { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; margin-top: 20px; }
    .receipt h3 { margin: 0 0 16px; color: #0f172a; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; }
    .receipt-row { display: flex; justify-content: space-between; padding: 8px 0; }
    .receipt-val { font-weight: 600; text-align: right; }
    .action-btn { display: inline-block; background-color: #0f172a; color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; padding: 16px 40px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(15, 23, 42, 0.2); }
    .unavailable { background-color: #fef2f2; border: 1px solid #fecaca; color: #b91c1c; padding: 16px; border-radius: 8px; text-align: center; font-weight: 600; }
    @media only screen and (max-width: 600px) {
      .container { width: 100% !important; padding: 20px !important; }
      .receipt-row { flex-direction: column; width: 100%; text-align: left !important; padding-bottom: 5px !important; }
      .receipt-val { padding-bottom: 15px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; padding: 40px 0;">
    <tr>
      <td align="center">
        <table border="0" cellpadding="0" cellspacing="0" width="600" class="container" style="background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; margin-top: 20px;">
          <tr>
            <td class="header">
              <div class="logo">
                <div></div>
                <span style="font-size: 20px; font-weight: 800; color: #0f172a; letter-spacing: -0.03em;">Stribble</span>
              </div>
            </td>
          </tr>
          <tr>
            <td class="content">
              <h1 style="color: #0f172a; font-size: 28px; font-weight: 800; margin: 0 0 16px; letter-spacing: -0.02em;">You're all set!</h1>
              <p style="color: #64748b; font-size: 16px; line-height: 1.6; margin: 0 0 32px;">
                Hi <strong>${escapeHtml(customerName || "Customer")}</strong>, thank you for purchasing <strong>${escapeHtml(courseName)}</strong>. Your access link is ready below.
              </p>
              ${downloadLink
      ? `<a href="${escapeHtml(downloadLink)}" target="_blank" class="action-btn">Access Course Content</a>`
      : `<div class="unavailable">Download link unavailable. Please reply to this email.</div>`}
              <div style="height: 40px;"></div>
              <div class="receipt">
                <h3>Receipt Details</h3>
                <div class="receipt-row">
                  <span style="color: #64748b; font-size: 14px;">Course: </span>
                  <span class="receipt-val" style="color: #0f172a; font-size: 14px;">${escapeHtml(courseName)}</span>
                </div>
                <div class="receipt-row">
                  <span style="color: #64748b; font-size: 14px;">Amount Paid: </span>
                  <span class="receipt-val" style="color: #10b981; font-size: 16px;">₹${escapeHtml(String(amount))}</span>
                </div>
                <div class="receipt-row">
                  <span style="color: #64748b; font-size: 14px;">Order ID: </span>
                  <span class="receipt-val" style="color: #334155; font-size: 14px; font-family: monospace;">${escapeHtml(orderId)}</span>
                </div>
                <div class="receipt-row">
                  <span style="color: #64748b; font-size: 14px;">Payment ID: </span>
                  <span class="receipt-val" style="color: #334155; font-size: 14px; font-family: monospace;">${escapeHtml(paymentId || "N/A")}</span>
                </div>
                <div class="receipt-row">
                  <span style="color: #64748b; font-size: 14px;">Date: </span>
                  <span class="receipt-val" style="color: #334155; font-size: 14px;">${escapeHtml(dateTime)}</span>
                </div>
              </div>
            </td>
          </tr>
          <tr>
            <td class="footer">
              <p>Need help? Contact <a href="mailto:${escapeHtml(supportEmail)}">${escapeHtml(supportEmail)}</a></p>
              <p>&copy; ${new Date().getFullYear()} Stribble. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

  const text = `
STRIBBLE ORDER CONFIRMATION
---------------------------
Hi ${customerName || "Customer"},

Thanks for purchasing: ${courseName}

ACCESS LINK:
${downloadLink || "Link unavailable, please contact support."}

RECEIPT:
Amount: ₹${amount}
Order ID: ${orderId}
Payment ID: ${paymentId || "N/A"}
Date: ${dateTime}
`;

  try {
    const info = await transporter.sendMail({
      from: FROM_EMAIL,
      to,
      subject: `Your Course: ${courseName}`,
      html,
      text,
    });
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error("sendPaymentEmail SMTP error:", err);
    throw err;
  }
}