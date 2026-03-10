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

export const sendEmail = async ({ to, subject, html, text, from, attachments }) => {
  try {
    const fromAddress = from || process.env.SES_FROM_EMAIL || "no-reply@stribble.site";
    
    const mailOptions = {
      from: fromAddress,
      to,
      subject,
      text, // Fallback
      html,
    };

    if (attachments && Array.isArray(attachments)) {
      mailOptions.attachments = attachments;
    }

    const info = await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error("Error sending email:", error);
    return false;
  }
};

// Helper explicitly for Course Announcements sent from course@stribble.site
export const sendCourseEmail = async ({ to, subject, html, text, attachments }) => {
  return sendEmail({
    from: "course@stribble.site",
    to,
    subject,
    html,
    text,
    attachments
  });
};
