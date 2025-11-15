// src/utils/email.js
import SESv2Pkg from "@aws-sdk/client-sesv2";
const { SESv2Client, SendEmailCommand } = SESv2Pkg;
import nodemailer from "nodemailer";
import Course from "../models/course.js"; // <-- important import

// Ensure AWS_REGION fallback
const sesClient = new SESv2Client({
  region: process.env.AWS_REGION || "ap-south-1", // fallback region
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const transporter = nodemailer.createTransport({
  SES: { ses: sesClient, SendEmailCommand },
});

/**
 * Send payment confirmation email.
 *
 * Either pass `downloadLink` directly, or pass `courseId` and the function will
 * fetch the googleDriveLink (explicitly selecting it).
 *
 * Params:
 * - to (string) - recipient email
 * - customerName (string)
 * - courseId (string) - optional if downloadLink provided
 * - courseName (string)
 * - amount (number)
 * - orderId (string)
 * - paymentId (string)
 * - dateTime (string)
 * - downloadLink (string) - optional; if not provided, will be loaded from DB
 * - supportEmail (string)
 */
export const sendPaymentEmail = async ({
  to,
  customerName,
  courseId,
  courseName,
  amount,
  orderId,
  paymentId,
  dateTime,
  downloadLink,
  supportEmail = "support@stribble.site",
}) => {
  try {
    // If no downloadLink provided, fetch the course and explicitly include the hidden field
    if (!downloadLink) {
      if (!courseId) {
        throw new Error("Either downloadLink or courseId must be provided to sendPaymentEmail");
      }
      const course = await Course.findById(courseId).select("+googleDriveLink").lean();
      if (!course) throw new Error("Course not found when preparing email");
      downloadLink = course.googleDriveLink;
    }

    // Fallback if still missing
    if (!downloadLink) {
      console.warn("sendPaymentEmail: no downloadLink available for course", courseId);
      // Optionally continue and send email without link, or throw — here we continue but with no button.
    }

    const htmlContent = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Your Course Access</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin:0;padding:0;background-color:#f4f6fa;font-family:Arial, Helvetica, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#f4f6fa;padding:30px 16px;">
    <tr>
      <td align="center">
        <table width="680" cellpadding="0" cellspacing="0" role="presentation" style="max-width:680px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 8px 30px rgba(18,27,44,0.08);">
          
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(90deg,#3b82f6,#06b6d4);padding:28px 32px;color:#ffffff;text-align:left;">
              <h1 style="margin:0;font-size:22px;font-weight:700;">MadeMyCourse</h1>
              <p style="margin:6px 0 0;font-size:14px;opacity:0.95;">Thank you for your purchase</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:28px 32px;">
              <p>Hi <strong>${customerName}</strong>,</p>
              <h2>Thank you for buying the course <span style="color:#2563eb;">“${courseName}”</span></h2>
              <p>We're excited to have you onboard. Below is a receipt for your purchase and a secure link to access your course.</p>

              <!-- Receipt Table -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border:1px solid #eef2ff;border-radius:10px;background:#fbfdff;padding:18px;">
                <tr>
                  <td>Order ID: <strong>${orderId}</strong></td>
                  <td>Payment ID: <strong>${paymentId}</strong></td>
                  <td>Date: <strong>${dateTime}</strong></td>
                </tr>
                <tr>
                  <td colspan="3" style="padding-top:12px;border-top:1px dashed #e6eefb;">
                    Course: <strong>${courseName}</strong> | Amount Paid: <strong>₹${amount}</strong>
                  </td>
                </tr>
              </table>

              <!-- Download Button -->
              <div style="text-align:center;margin-top:22px;">
                ${downloadLink ? `<a href="${downloadLink}" target="_blank" style="padding:14px 22px;border-radius:10px;background:linear-gradient(90deg,#2563eb,#06b6d4);color:#fff;font-weight:700;text-decoration:none;">
                  Access Your Course
                </a>` : `<p style="color:#ff4d4f;">Download link is not available. Please contact support.</p>`}
              </div>

              <p style="margin-top:18px;font-size:13px;color:#6b7280;">
                If you face any issues, contact us at <a href="mailto:${supportEmail}">${supportEmail}</a>.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;padding:18px 32px;border-top:1px solid #eef2ff;text-align:center;font-size:12px;color:#9aa3b2;">
              MadeMyCourse • mademycourse.online
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    // Send email
    await transporter.sendMail({
      from: "no-reply@stribble.site", // must be verified in SES
      to,
      subject: `Here is your Course - ${courseName}`,
      html: htmlContent,
    });

    return true;
  } catch (err) {
    console.error("sendPaymentEmail error:", err);
    throw err; // let caller handle failure (or return false)
  }
};
