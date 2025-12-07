# Vercel Cron Job Setup Guide

This guide will help you set up automated Reddit post searching using Vercel Cron Jobs.

## Prerequisites

- Vercel account (Pro plan or higher required for Cron Jobs)
- Your app deployed on Vercel
- Environment variables set up

## Step-by-Step Instructions

### Step 1: Generate and Set API Key

1. **Generate a secure API key** (run this in your terminal):
   ```bash
   openssl rand -hex 32
   ```
   This will output something like: `a1b2c3d4e5f6...` (64 characters)

2. **Add the API key to Vercel Environment Variables**:
   - Go to your Vercel dashboard: https://vercel.com/dashboard
   - Select your project
   - Go to **Settings** → **Environment Variables**
   - Add a new variable:
     - **Name**: `CRON_API_KEY`
     - **Value**: Paste the generated key
     - **Environments**: Select all (Production, Preview, Development)
   - Click **Save**

3. **Redeploy your application**:
   - Go to **Deployments** tab
   - Click the **...** menu on your latest deployment
   - Select **Redeploy** to apply the new environment variable

### Step 2: Create vercel.json Configuration

1. **Create `vercel.json` file** in your project root (same level as `package.json`):

```json
{
  "crons": [
    {
      "path": "/api/cron/search-reddit-posts",
      "schedule": "0 9 * * *"
    }
  ]
}
```

**Schedule format**: `minute hour day-of-month month day-of-week`
- `0 9 * * *` = Daily at 9:00 AM UTC
- `0 */6 * * *` = Every 6 hours
- `0 0 * * 0` = Every Sunday at midnight
- `*/30 * * * *` = Every 30 minutes

2. **Commit and push to your repository**:
   ```bash
   git add vercel.json
   git commit -m "Add Vercel cron job configuration"
   git push
   ```

3. **Vercel will automatically detect and set up the cron job** after deployment.

### Step 3: Update Cron Endpoint to Handle Vercel Cron

Vercel Cron Jobs send a special header. Update your endpoint to handle both manual calls and Vercel cron triggers:

The current endpoint already supports API key authentication, which works for Vercel cron jobs.

### Step 4: Configure User Email for Cron Job

You need to decide which user(s) the cron job should run for. You have two options:

#### Option A: Single User (Recommended for Testing)

Modify the cron endpoint to use a specific user email by default, or pass it in the request.

**Option B: Multiple Users (Advanced)**

You could modify the cron endpoint to:
1. Fetch all users who have enabled automated posting
2. Run the search for each user
3. Store results per user

For now, we'll set up for a single user.

### Step 5: Update Cron Endpoint to Accept User Email

The endpoint already accepts `userEmail` in the request body. When Vercel triggers the cron, you can either:

1. **Modify the endpoint** to read user email from environment variable, OR
2. **Use a separate endpoint** that's specifically for Vercel cron with a hardcoded user

Let's create a wrapper endpoint for Vercel cron:

### Step 6: Create Vercel-Specific Cron Endpoint (Optional)

Create `app/api/cron/vercel-search/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    // Verify this is from Vercel Cron
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user email from environment variable or request
    const userEmail = process.env.CRON_USER_EMAIL;
    if (!userEmail) {
      return NextResponse.json(
        { error: "CRON_USER_EMAIL not configured" },
        { status: 500 }
      );
    }

    // Call the main cron endpoint
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    const response = await fetch(`${baseUrl}/api/cron/search-reddit-posts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userEmail,
        postCount: parseInt(process.env.CRON_POST_COUNT || "10", 10),
        apiKey: process.env.CRON_API_KEY,
      }),
    });

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Vercel cron error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
```

**Alternative (Simpler)**: Update your `vercel.json` to include the user email in the path or use query parameters.

### Step 7: Set Additional Environment Variables

Add to Vercel Environment Variables:

1. **CRON_USER_EMAIL**: The email of the user to run the cron job for
   - Example: `user@example.com`

2. **CRON_POST_COUNT** (optional): Number of posts to fetch per run
   - Default: `10`
   - Example: `20`

3. **CRON_SECRET** (if using the wrapper endpoint):
   - Generate: `openssl rand -hex 32`
   - Used to verify requests are from Vercel

### Step 8: Update vercel.json (If Using Wrapper)

If you created the wrapper endpoint, update `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/vercel-search",
      "schedule": "0 9 * * *"
    }
  ]
}
```

### Step 9: Test the Cron Job

1. **Test manually** using curl:
   ```bash
   curl -X POST https://your-domain.com/api/cron/search-reddit-posts \
     -H "Content-Type: application/json" \
     -d '{
       "userEmail": "your-user@example.com",
       "postCount": 10,
       "apiKey": "your-cron-api-key"
     }'
   ```

2. **Test the Vercel cron** (if using wrapper):
   ```bash
   curl -X GET https://your-domain.com/api/cron/vercel-search \
     -H "Authorization: Bearer your-cron-secret"
   ```

3. **Check Vercel Cron Logs**:
   - Go to Vercel Dashboard → Your Project → **Functions** tab
   - Click on the cron function
   - View execution logs and status

### Step 10: Verify Cron Job is Running

1. **Check Vercel Dashboard**:
   - Go to **Settings** → **Cron Jobs**
   - You should see your cron job listed
   - Check execution history and logs

2. **Monitor your database**:
   - Check the `usage` collection for `cronUsage` increments
   - Verify posts are being found

3. **Check Vercel Function Logs**:
   - Go to **Functions** tab
   - View real-time logs during execution

## Troubleshooting

### Cron Job Not Running

1. **Check Vercel Plan**: Cron Jobs require Pro plan or higher
2. **Verify vercel.json**: Make sure it's committed and deployed
3. **Check Schedule Format**: Verify the cron expression is correct
4. **Check Logs**: Review function logs for errors

### Authentication Errors

1. **Verify Environment Variables**: Make sure `CRON_API_KEY` is set in Vercel
2. **Check API Key**: Verify the key matches in both places
3. **Verify User Email**: Make sure the user exists in your database

### Rate Limiting

If you hit rate limits:
1. Adjust `CRON_POST_COUNT` to fetch fewer posts
2. Increase the interval between cron runs
3. Check your OpenAI/Google API quotas

## Schedule Examples

```json
{
  "crons": [
    {
      "path": "/api/cron/search-reddit-posts",
      "schedule": "0 9 * * *"    // Daily at 9 AM UTC
    },
    {
      "path": "/api/cron/search-reddit-posts",
      "schedule": "0 */6 * * *"  // Every 6 hours
    },
    {
      "path": "/api/cron/search-reddit-posts",
      "schedule": "*/30 * * * *" // Every 30 minutes
    },
    {
      "path": "/api/cron/search-reddit-posts",
      "schedule": "0 0 * * 0"    // Weekly on Sunday
    }
  ]
}
```

## Multiple Users

To run cron jobs for multiple users, you would need to:

1. Add a `users` array to environment variables (or query from database)
2. Loop through users in the cron endpoint
3. Process each user sequentially or in parallel (with rate limit considerations)

This requires modifying the cron endpoint logic.

## Next Steps

1. ✅ Set up cron job on Vercel
2. Monitor execution logs
3. Set up error notifications (optional - use Vercel webhooks or external service)
4. Consider adding retry logic for failed executions
5. Set up database storage for cron results (if not already implemented)

