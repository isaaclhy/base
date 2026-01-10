/**
 * Brevo (formerly Sendinblue) email utilities
 * API Documentation: https://developers.brevo.com/reference
 */

interface BrevoEmailOptions {
  to: string;
  subject: string;
  htmlContent?: string;
  textContent?: string;
  templateId?: number;
  params?: Record<string, any>;
}

interface BrevoResponse {
  messageId: string;
}

/**
 * Send a transactional email via Brevo API
 */
export async function sendBrevoEmail(options: BrevoEmailOptions): Promise<BrevoResponse> {
  const apiKey = process.env.BREVO_API_KEY;

  if (!apiKey) {
    throw new Error("BREVO_API_KEY is not configured in environment variables");
  }

  const url = "https://api.brevo.com/v3/smtp/email";

  const payload: any = {
    sender: {
      name: process.env.BREVO_SENDER_NAME || "SignalScouter",
      email: process.env.BREVO_SENDER_EMAIL || "noreply@signalscouter.com",
    },
    to: [
      {
        email: options.to,
      },
    ],
    subject: options.subject,
  };

  // Use template if provided, otherwise use raw content
  if (options.templateId) {
    payload.templateId = options.templateId;
    if (options.params) {
      payload.params = options.params;
    }
  } else {
    if (options.htmlContent) {
      payload.htmlContent = options.htmlContent;
    }
    if (options.textContent) {
      payload.textContent = options.textContent;
    }
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(
        `Brevo API error (${response.status}): ${errorData.message || JSON.stringify(errorData)}`
      );
    }

    const data = await response.json();
    return {
      messageId: data.messageId || "unknown",
    };
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Failed to send email via Brevo: ${String(error)}`);
  }
}

/**
 * Send welcome email to new users
 */
export async function sendWelcomeEmail(email: string, name?: string | null): Promise<void> {
  const userName = name || "there";
  const appUrl = process.env.NEXTAUTH_URL || "https://signalscouter.com";

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to SignalScouter</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #ff4500 0%, #ff6314 100%); padding: 30px; text-align: left; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to SignalScouter! 🎉</h1>
  </div>
  
  <div style="background: #ffffff; padding: 20px 15px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
    <p style="font-size: 16px; margin-bottom: 20px;">Hi ${userName},</p>
    
    <p style="font-size: 16px; margin-bottom: 20px;">
      Welcome to SignalScouter! We're excited to have you on board. You're now part of a community that's automating Reddit engagement and finding high-potential leads effortlessly. For best experience, we recommend you to use a laptop/desktop browser.
    </p>
    
    <h2 style="font-size: 14px; margin-top: 30px; margin-bottom: 20px; color: #667eea; font-weight: normal;">Here's what you can do:</h2>
    <ul style="font-size: 14px; line-height: 2.5; padding-left: 20px; margin: 0;">
      <li style="margin-bottom: 12px;">🎯 Discover high-potential Reddit posts automatically</li>
      <li style="margin-bottom: 12px;">🤖 Generate AI-powered comments tailored to each post</li>
      <li style="margin-bottom: 12px;">⚡ Sync leads and organize them in one place</li>
      <li style="margin-bottom: 12px;">🚀 Engage with your audience on autopilot (Premium feature)</li>
    </ul>
    
    <div style="text-align: center; margin: 40px 0;">
      <a href="${appUrl}/playground" style="display: inline-block; background: #ff4500; color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">Get Started Now</a>
    </div>
    
    <p style="font-size: 14px; color: #666; margin-top: 30px;">
      Need help? Just reply to this email and we'll be happy to assist you.
    </p>
    
    <p style="font-size: 14px; color: #666; margin-top: 20px;">
      Best regards,<br>
      The SignalScouter Team
    </p>
  </div>
  
  <div style="text-align: center; margin-top: 20px; padding: 20px; color: #999; font-size: 12px;">
    <p>© ${new Date().getFullYear()} SignalScouter. All rights reserved.</p>
    <p>
      <a href="${appUrl}" style="color: #667eea; text-decoration: none;">Visit our website</a>
    </p>
  </div>
</body>
</html>
  `;

  const textContent = `
Welcome to SignalScouter! 🎉

Hi ${userName},

Welcome to SignalScouter! We're excited to have you on board. You're now part of a community that's automating Reddit engagement and finding high-potential leads effortlessly.

Here's what you can do:
- 🎯 Discover high-potential Reddit posts automatically
- 🤖 Generate AI-powered comments tailored to each post
- ⚡ Sync leads and organize them in one place
- 🚀 Engage with your audience on autopilot (Premium feature)

Get started: ${appUrl}/playground

Need help? Just reply to this email and we'll be happy to assist you.

Best regards,
The SignalScouter Team

© ${new Date().getFullYear()} SignalScouter. All rights reserved.
  `;

  try {
    await sendBrevoEmail({
      to: email,
      subject: "Welcome to SignalScouter! 🎉",
      htmlContent,
      textContent,
    });
    console.log(`✓ Welcome email sent to ${email}`);
  } catch (error) {
    console.error(`Failed to send welcome email to ${email}:`, error);
    // Don't throw - we don't want to block user signup if email fails
  }
}
