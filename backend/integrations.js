import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

// 📧 1. THE GMAIL PIPELINE
export async function sendEmail(to, subject, text) {
    try {
        console.log(`🚀 Initiating Gmail Pipeline to: ${to}`);
        
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        const mailOptions = {
            from: `"AgentForge AI" <${process.env.EMAIL_USER}>`,
            to: to,
            subject: subject,
            text: text
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`✅ Email sent successfully: ${info.messageId}`);
        return { success: true, message: "Email sent successfully." };

    } catch (error) {
        console.error("🔴 Gmail Pipeline Error:", error);
        return { success: false, error: error.message };
    }
}

// 🕸️ 2. THE UNIVERSAL WEBHOOK PIPELINE (n8n / Zapier)
export async function fireWebhook(url, payload) {
    try {
        console.log(`🚀 Firing Webhook to: ${url}`);
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error(`Webhook failed with status ${response.status}`);
        
        console.log(`✅ Webhook fired successfully!`);
        return { success: true, message: "Data synced to external system." };

    } catch (error) {
        console.error("🔴 Webhook Pipeline Error:", error);
        return { success: false, error: error.message };
    }
}