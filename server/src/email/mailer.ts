import nodemailer from "nodemailer";

export const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: false, // true if using 465
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendVerificationCode(to: string, code: string) {
  const from = process.env.SMTP_FROM ?? "no-reply@localhost";
  await transporter.sendMail({
    from,
    to,
    subject: "Your Pixel Coliseum verification code",
    text: `Your verification code is: ${code}\n\nThis code expires in 10 minutes.`,
  });
}
