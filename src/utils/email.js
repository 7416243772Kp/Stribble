// src/utils/email.js
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import Course from "../models/course.js";

// Configuration
const REGION = process.env.AWS_REGION || "ap-south-1";
const FROM_EMAIL = process.env.SES_FROM_EMAIL || "no-reply@stribble.site";

// create SES client (will use env creds or default chain)
const sesClient = new SESClient({
  region: REGION,
  ...(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        credentials: {
          accessKeyId: String(process.env.AWS_ACCESS_KEY_ID).trim(),
          secretAccessKey: String(process.env.AWS_SECRET_ACCESS_KEY).trim(),
        },
      }
    : {}),
});

/**
 * sendPaymentEmail(opts)
 * opts:
 *   - to (string) REQUIRED
 *   - customerName (string)
 *   - courseId (string) optional if downloadLink provided
 *   - courseName (string)
 *   - amount (number)
 *   - orderId (string)
 *   - paymentId (string)
 *   - dateTime (string)
 *   - downloadLink (string) optional
 *   - supportEmail (string)
 *
 * Returns: { success: true, messageId } on success
 * Throws: on SES / transport errors
 */
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

  if (!to) {
    throw new Error("Missing 'to' email address");
  }

  // Resolve downloadLink: prefer provided link, else fetch course by id
  let downloadLink = dlFromOpts || null;
  if (!downloadLink && courseId) {
    try {
      const course = await Course.findById(courseId).select("+googleDriveLink").lean();
      downloadLink = course?.googleDriveLink || null;
    } catch (e) {
      console.warn("sendPaymentEmail: failed to load course by id:", e?.message || e);
    }
  }

  // Build professional HTML (download button if link present)
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Your course access</title>
    <meta name="viewport" content="width=device-width,initial-scale=1" />
  </head>
  <body style="margin:0;padding:0;background:#f4f6fa;font-family:Inter, Arial, Helvetica, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="padding:28px;">
      <tr>
        <td align="center">
          <table width="680" cellpadding="0" cellspacing="0" role="presentation" style="max-width:680px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 8px 24px rgba(11,22,39,0.08);">
            <tr>
              <td style="background:linear-gradient(90deg,#2563eb,#06b6d4);padding:24px 28px;color:#ffffff;">
                <h1 style="margin:0;font-size:20px;">MadeMyCourse</h1>
                <div style="margin-top:6px;font-size:13px;opacity:0.95;">Thanks for your purchase</div>
              </td>
            </tr>

            <tr>
              <td style="padding:22px 28px;color:#111;">
                <p style="margin:0 0 12px;">Hi <strong>${escapeHtml(customerName || to.split("@")[0])}</strong>,</p>

                <h2 style="font-size:18px;margin:0 0 12px;">Your purchase: ${escapeHtml(courseName || "Course")}</h2>

                <p style="margin:0 0 16px;color:#374151;">
                  Thank you for completing the payment. Below is your receipt and access information.
                </p>

                <table cellpadding="8" cellspacing="0" role="presentation" style="width:100%;border:1px solid #eef2ff;border-radius:8px;background:#fbfdff;">
                  <tr>
                    <td style="font-size:13px">Order ID:</td>
                    <td style="font-weight:700">${escapeHtml(String(orderId || ""))}</td>
                    <td style="font-size:13px">Payment ID:</td>
                    <td style="font-weight:700">${escapeHtml(String(paymentId || ""))}</td>
                  </tr>
                  <tr>
                    <td style="font-size:13px">Date:</td>
                    <td style="font-weight:700">${escapeHtml(String(dateTime || new Date().toLocaleString()))}</td>
                    <td style="font-size:13px">Amount:</td>
                    <td style="font-weight:700">₹${escapeHtml(String(amount ?? ""))}</td>
                  </tr>
                </table>

                <div style="text-align:center;margin-top:20px;">
                  ${
                    downloadLink
                      ? `<a href="${escapeHtml(downloadLink)}" target="_blank" style="display:inline-block;padding:12px 18px;border-radius:10px;background:linear-gradient(90deg,#2563eb,#06b6d4);color:#fff;font-weight:700;text-decoration:none;">Access Your Course</a>`
                      : `<p style="color:#b91c1c;font-weight:700;">Download link is not available. Please contact <a href="mailto:${escapeHtml(
                          supportEmail
                        )}">${escapeHtml(supportEmail)}</a> for assistance.</p>`
                  }
                </div>

                <p style="margin-top:18px;font-size:13px;color:#6b7280;">
                  If you face any issues, reply to this email or contact <a href="mailto:${escapeHtml(
                    supportEmail
                  )}">${escapeHtml(supportEmail)}</a>.
                </p>
              </td>
            </tr>

            <tr>
              <td style="background:#f8fafc;padding:14px 18px;text-align:center;font-size:12px;color:#9aa3b2;">
                MadeMyCourse • mademycourse.online
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  // Text fallback
  const text = [
    `Thanks for your purchase${customerName ? ", " + customerName : ""}!`,
    `Course: ${courseName}`,
    `Order ID: ${orderId || ""}`,
    `Payment ID: ${paymentId || ""}`,
    `Date: ${dateTime || ""}`,
    downloadLink ? `Download link: ${downloadLink}` : `Download link not available — please contact ${supportEmail}`,
  ].join("\n");

  // Prepare SES params
  const params = {
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Charset: "UTF-8", Data: `Your course access — ${courseName || "MadeMyCourse"}` },
      Body: {
        Html: { Charset: "UTF-8", Data: html },
        Text: { Charset: "UTF-8", Data: text },
      },
    },
    Source: FROM_EMAIL,
  };

  try {
    const command = new SendEmailCommand(params);
    const res = await sesClient.send(command);
    return { success: true, messageId: res.MessageId || null };
  } catch (err) {
    console.error("sendPaymentEmail SES error:", err);
    // Re-throw so caller can record failure and show in admin UI
    throw err;
  }
}

// small helper to avoid injected HTML
function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
