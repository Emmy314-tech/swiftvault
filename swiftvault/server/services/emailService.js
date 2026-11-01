import nodemailer from "nodemailer";

export const sendEmailOTP = async (email, otp) => {
const transporter = nodemailer.createTransport({
service: "gmail",
auth: {
user: process.env.EMAIL_USER,
pass: process.env.EMAIL_PASS
}
});

await transporter.sendMail({
from: process.env.EMAIL_USER,
to: email,
subject: `Your SwiftVault Verification Code: ${otp}`,
html: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; background:#ffffff; border:1px solid #e5e5e5; border-radius:12px; overflow:hidden;">

  <div style="background:#0d6efd; padding:25px; text-align:center;">
    <h1 style="color:white; margin:0;">
      SwiftVault
    </h1>
    <p style="color:#dbeafe; margin-top:8px;">
      Secure Wallet & VTU Platform
    </p>
  </div>

  <div style="padding:30px;">

    <h2 style="color:#222;">
      Email Verification
    </h2>

    <p>Hello,</p>

    <p>
      Thank you for registering on <strong>SwiftVault</strong>.
      To complete your account setup, please use the verification code below:
    </p>

    <div style="
      background:#f8fafc;
      border:2px dashed #0d6efd;
      padding:25px;
      text-align:center;
      border-radius:10px;
      margin:25px 0;
    ">
      <h1 style="
        color:#0d6efd;
        font-size:40px;
        letter-spacing:8px;
        margin:0;
      ">
        ${otp}
      </h1>
    </div>

    <p>
      This code will expire in
      <strong>10 minutes</strong>.
    </p>

    <p>
      For your security, never share this code with anyone.
      SwiftVault staff will never ask for your OTP.
    </p>

    <p>
      If you did not create a SwiftVault account,
      you can safely ignore this email.
    </p>

  </div>

  <div style="
    background:#f8fafc;
    padding:20px;
    text-align:center;
    font-size:12px;
    color:#666;
  ">
    <p>
      This is an automated message from SwiftVault.
      Please do not reply to this email.
    </p>

    <p>
      © ${new Date().getFullYear()} SwiftVault. All rights reserved.
    </p>
  </div>

</div>
`

});
};
