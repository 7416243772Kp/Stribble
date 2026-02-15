import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "mail.smtp2go.com",
  port: process.env.SMTP_PORT || 2525,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export const sendEmail = async ({ to, subject, html, text }) => {
  try {
    const info = await transporter.sendMail({
      from: process.env.SES_FROM_EMAIL || "no-reply@stribble.site",
      to,
      subject,
      text, // Fallback
      html,
    });

    return true;
  } catch (error) {
    console.error("Error sending email:", error);
    return false;
  }
};
