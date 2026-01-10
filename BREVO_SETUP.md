# Brevo Email Setup Guide

This guide explains how to set up Brevo (formerly Sendinblue) to send welcome emails to new users.

## Prerequisites

1. Create a Brevo account at [https://www.brevo.com](https://www.brevo.com)
2. Verify your sender email address in Brevo dashboard
3. Get your API key from Brevo

## Setup Steps

### 1. Get Your Brevo API Key

1. Log in to your Brevo account
2. Go to **Settings** → **API Keys** (or [direct link](https://app.brevo.com/settings/keys/api))
3. Click **Generate a new API key**
4. Give it a name (e.g., "SignalScouter Production")
5. Select **Full access** or at minimum:
   - ✅ **Send emails** (required)
   - ✅ **Access account master data** (optional, for templates)
6. Copy the API key (you won't be able to see it again)

### 2. Configure Environment Variables

Add the following environment variables to your `.env.local` file (for local development) and your production environment (Vercel, etc.):

```bash
# Required: Your Brevo API key
BREVO_API_KEY=your_brevo_api_key_here

# Optional: Customize sender information
BREVO_SENDER_NAME=SignalScouter
BREVO_SENDER_EMAIL=noreply@signalscouter.com
```

**Important Notes:**
- The sender email (`BREVO_SENDER_EMAIL`) must be verified in your Brevo account
- If you don't set `BREVO_SENDER_EMAIL`, it will default to `noreply@signalscouter.com`
- You must verify this email address in Brevo before sending emails

### 3. Verify Your Sender Email in Brevo

1. Go to **Settings** → **Senders** in Brevo dashboard
2. Click **Add a sender**
3. Enter your sender email address
4. Verify the email by clicking the verification link sent to that email
5. Wait for approval (usually instant, but can take up to 24 hours)

### 4. Test the Integration

1. Start your development server:
   ```bash
   npm run dev
   ```

2. Sign up with a new user account
3. Check the server logs - you should see:
   ```
   ✓ Welcome email sent to user@example.com
   ```

4. Check the recipient's inbox (and spam folder) for the welcome email

5. Check Brevo dashboard → **Statistics** → **Emails** to see sent emails

## How It Works

1. When a user signs up via Google OAuth, the `signIn` callback in `auth.ts` is triggered
2. The `createOrUpdateUser` function checks if the user is new or existing
3. If it's a new user (`isNew: true`), the welcome email is sent asynchronously
4. The email is sent using the Brevo API via the `sendWelcomeEmail` function in `lib/brevo/email.ts`

## Email Template

The welcome email template is defined in `lib/brevo/email.ts` and includes:
- HTML version (styled email)
- Plain text version (fallback)
- Welcome message
- Feature highlights
- Call-to-action button to get started
- Professional branding

### Customizing the Email Template

To customize the welcome email, edit the `sendWelcomeEmail` function in `lib/brevo/email.ts`:

```typescript
// Modify the htmlContent and textContent variables
const htmlContent = `...your custom HTML...`;
const textContent = `...your custom plain text...`;
```

## Using Brevo Templates (Optional)

Instead of hardcoding HTML in the code, you can create email templates in Brevo and use them:

1. Go to **Email templates** in Brevo dashboard
2. Create a new template
3. Note the template ID
4. Update the `sendWelcomeEmail` function to use:

```typescript
await sendBrevoEmail({
  to: email,
  subject: "Welcome to SignalScouter! 🎉",
  templateId: 123, // Your template ID
  params: {
    USER_NAME: name || "there",
    APP_URL: appUrl,
  },
});
```

## Error Handling

- If the Brevo API key is missing, an error will be logged but signup will not be blocked
- If email sending fails, an error is logged but the user signup process continues
- All errors are logged to the console for debugging

## Troubleshooting

### Emails not sending

1. **Check API key**: Verify `BREVO_API_KEY` is set correctly
2. **Check sender verification**: Ensure sender email is verified in Brevo
3. **Check logs**: Look for error messages in server logs
4. **Check Brevo dashboard**: Go to Statistics → Emails to see delivery status

### Emails going to spam

1. Set up SPF, DKIM, and DMARC records for your domain
2. Use a verified sender email
3. Avoid spammy words in subject/content
4. Warm up your IP/domain gradually

### API Errors

Common Brevo API errors:
- **401 Unauthorized**: Invalid API key
- **400 Bad Request**: Invalid sender email or recipient
- **403 Forbidden**: Sender email not verified
- **429 Too Many Requests**: Rate limit exceeded (check your plan limits)

## Rate Limits

Brevo free plan limits:
- 300 emails/day
- 9,000 emails/month

Check your plan limits in Brevo dashboard → **Settings** → **Account Limits**

## Additional Resources

- [Brevo API Documentation](https://developers.brevo.com/reference)
- [Brevo Transactional Email API](https://developers.brevo.com/reference/sendtransacemail)
- [Brevo Email Templates](https://help.brevo.com/hc/en-us/articles/209467485)

## Next Steps

You can extend this integration to send other emails:
- Password reset emails
- Trial expiration reminders
- Weekly usage summaries
- Auto-pilot activity reports
- Payment confirmations

Follow the same pattern: create a function in `lib/brevo/email.ts` and call it from the appropriate place in your code.
