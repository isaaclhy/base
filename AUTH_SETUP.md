# Google OAuth Setup Guide

This guide will help you set up Google OAuth authentication for your Next.js application.

## Prerequisites

- A Google Cloud Platform (GCP) account
- Access to Google Cloud Console

## Step 1: Create Google OAuth Credentials

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Navigate to **APIs & Services** > **Credentials**
4. Click **Create Credentials** > **OAuth client ID**
5. If prompted, configure the OAuth consent screen:
   - Choose **External** (unless you have a Google Workspace)
   - Fill in the required information (App name, User support email, Developer contact)
   - Add your email to test users if needed
   - Save and continue through the scopes and test users screens
6. For the OAuth client ID:
   - Application type: **Web application**
   - Name: Your app name
   - Authorized JavaScript origins:
     - `http://localhost:3000` (for development)
     - Your production URL (e.g., `https://yourdomain.com`)
   - Authorized redirect URIs:
     - `http://localhost:3000/api/auth/callback/google` (for development)
     - `https://yourdomain.com/api/auth/callback/google` (for production)
7. Click **Create**
8. Copy the **Client ID** and **Client Secret**

## Step 2: Set Up Environment Variables

Create a `.env.local` file in the root of your project with the following variables:

```env
# NextAuth.js Configuration
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-key-here-generate-a-random-string

# Google OAuth Credentials
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# MongoDB Configuration
MONGO_URL=your-mongodb-connection-string

# Reddit OAuth Configuration (for posting comments)
# Get these from: https://www.reddit.com/prefs/apps
REDDIT_CLIENT_ID=your-reddit-client-id
REDDIT_CLIENT_SECRET=your-reddit-client-secret
REDDIT_REDIRECT_URI=http://localhost:3000/api/reddit/callback
# For production, use: https://yourdomain.com/api/reddit/callback

# Stripe Configuration
# Create a product with a recurring price in your Stripe dashboard and enable the billing portal in test mode
STRIPE_SECRET_KEY=sk_live_or_test_key
STRIPE_PRICE_ID=price_for_premium_plan
STRIPE_WEBHOOK_SECRET=whsec_from_stripe_cli_or_dashboard
STRIPE_PORTAL_CONFIGURATION_ID=bpc_optional_portal_configuration
```

### Stripe Billing Portal

1. Go to [Dashboard → Settings → Billing → Customer portal](https://dashboard.stripe.com/test/settings/billing/portal).
2. Configure the options you want exposed to customers and click **Save** to create the default configuration.
3. (Optional) If you want to lock the portal to a specific configuration, copy the ID (starts with `bpc_...`) and set it as `STRIPE_PORTAL_CONFIGURATION_ID`. Leaving it unset uses Stripe's default portal.
4. For local testing, run `stripe listen --forward-to http://localhost:3000/api/stripe/webhook` and copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

### Generating NEXTAUTH_SECRET

You can generate a secure random string for `NEXTAUTH_SECRET` using one of these methods:

**Using OpenSSL:**
```bash
openssl rand -base64 32
```

**Using Node.js:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

**Online generator:**
Visit https://generate-secret.vercel.app/32

## Step 3: Update Production Environment Variables

For production (e.g., Vercel, Netlify):

1. Set `NEXTAUTH_URL` to your production URL (e.g., `https://yourdomain.com`)
2. Add all the environment variables from `.env.local` to your hosting platform's environment variables settings

## Step 4: Test the Authentication

1. Start your development server:
   ```bash
   pnpm dev
   ```

2. Navigate to `http://localhost:3000`
3. Click the "Sign in with Google" button
4. You should be redirected to Google's sign-in page
5. After signing in, you should be redirected back to your app

## Features

- **Sign In**: Users can sign in with their Google account
- **User Menu**: Authenticated users see their profile picture/name with a dropdown menu
- **Sign Out**: Users can sign out from the user menu
- **Protected Routes**: You can protect routes by checking the session

## Usage in Your Components

### Check if user is authenticated:

```tsx
"use client";

import { useSession } from "next-auth/react";

export function MyComponent() {
  const { data: session, status } = useSession();

  if (status === "loading") return <p>Loading...</p>;
  if (status === "unauthenticated") return <p>Not signed in</p>;

  return <p>Signed in as {session?.user?.email}</p>;
}
```

### Protect server-side routes:

```tsx
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function ProtectedPage() {
  const session = await auth();

  if (!session) {
    redirect("/auth/signin");
  }

  return <div>Protected content</div>;
}
```

## Troubleshooting

### "Invalid redirect_uri" error

Make sure the redirect URI in your Google Cloud Console matches exactly:
- Development: `http://localhost:3000/api/auth/callback/google`
- Production: `https://yourdomain.com/api/auth/callback/google`

### "NEXTAUTH_SECRET is not set" error

Make sure you've set the `NEXTAUTH_SECRET` environment variable in your `.env.local` file.

### Session not persisting

Check that:
1. `NEXTAUTH_URL` is set correctly
2. Cookies are enabled in your browser
3. You're not in incognito/private mode (if testing)

## Additional Resources

- [NextAuth.js Documentation](https://next-auth.js.org/)
- [Google OAuth Documentation](https://developers.google.com/identity/protocols/oauth2)
- [NextAuth.js v5 (Beta) Documentation](https://authjs.dev/)

