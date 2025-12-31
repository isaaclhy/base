# Auto-pilot Cron Job Setup

This guide explains how to set up a GitHub Action to run the auto-pilot function every 2 hours.

## Overview

The auto-pilot function:
1. Fetches leads for your keywords via Google Search (50 results per keyword)
2. Fetches leads from your subreddits (30 results per keyword-subreddit combination)
3. Filters posts to only those from the past 2 hours
4. Applies AI filter to remove posts that return "NO"
5. Generates comments using OpenAI (Founder persona)
6. Posts comments to Reddit
7. Saves posted posts to the database
8. Returns the results with posted/failed counts

## Setup Steps

### 1. Add Required Secrets to GitHub

Go to your GitHub repository → Settings → Secrets and variables → Actions → New repository secret

Add the following secrets:

1. **`CRON_API_KEY`**: A secure API key (generate with `openssl rand -hex 32`)
2. **`APP_URL`**: Your application URL (e.g., `https://www.signalscouter.com`)
3. **`CRON_USER_EMAIL`**: The email of the user to run auto-pilot for

### 2. Add API Key to Environment Variables

Add the same `CRON_API_KEY` to your application's environment variables (`.env.local` for local, or Vercel/environment settings for production):

```bash
CRON_API_KEY=your-secure-random-api-key-here
```

### 3. GitHub Actions Workflow

The workflow file (`.github/workflows/auto-pilot.yml`) is already created. It will:
- Run every 2 hours automatically
- Allow manual triggers via GitHub Actions UI
- Call your `/api/cron/auto-pilot` endpoint

### 4. Test the Endpoint

Test the endpoint manually first:

```bash
curl -X POST https://your-domain.com/api/cron/auto-pilot \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "userEmail": "user@example.com",
    "apiKey": "your-api-key"
  }'
```

Or test locally:

```bash
curl -X POST http://localhost:3000/api/cron/auto-pilot \
  -H "Content-Type: application/json" \
  -d '{
    "userEmail": "user@example.com",
    "apiKey": "your-api-key"
  }'
```

## Requirements

Before the auto-pilot can run, ensure:
- User has keywords added in the Product tab
- User has a product description saved
- User has Reddit connected (recommended for best results)
- User has subreddits added (optional, but recommended)

## Response Format

```json
{
  "success": true,
  "message": "Processed 5 posts: 4 posted, 1 failed",
  "posts": [
    {
      "title": "Post title",
      "link": "https://reddit.com/r/...",
      "snippet": "Post snippet",
      "selftext": "Full post text",
      "postData": {
        "ups": 100,
        "num_comments": 50,
        "created_utc": 1234567890,
        "name": "t3_abc123"
      },
      "keyword": "your-keyword"
    }
  ],
  "totalFound": 100,
  "afterTimeFilter": 15,
  "afterAiFilter": 5,
  "postedCount": 4,
  "failedCount": 1
}
```

**Note:** Posts that are successfully posted will be saved to the database with status "posted" and will appear in the Analytics/History tab.

## Schedule

The workflow is configured to run every 2 hours:
```yaml
- cron: '0 */2 * * *'
```

To change the schedule, edit `.github/workflows/auto-pilot.yml` and modify the cron expression.

Common schedules:
- Every 2 hours: `'0 */2 * * *'`
- Every hour: `'0 * * * *'`
- Every 30 minutes: `'*/30 * * * *'`
- Daily at 9 AM UTC: `'0 9 * * *'`

## Manual Trigger

There are several ways to manually trigger the auto-pilot:

### Option 1: GitHub Actions UI (Recommended for scheduled runs)

1. Go to your GitHub repository
2. Click on the **"Actions"** tab
3. Select **"Auto-pilot Cron Job"** workflow from the left sidebar
4. Click the **"Run workflow"** button (top right)
5. Select the branch and click **"Run workflow"**

### Option 2: Direct API Call (POST method)

Call the API endpoint directly using curl:

**For production:**
```bash
curl -X POST https://www.signalscouter.com/api/cron/auto-pilot \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_CRON_API_KEY" \
  -d '{
    "userEmail": "your-email@example.com",
    "apiKey": "YOUR_CRON_API_KEY"
  }'
```

**For local development:**
```bash
curl -X POST http://localhost:3000/api/cron/auto-pilot \
  -H "Content-Type: application/json" \
  -d '{
    "userEmail": "your-email@example.com",
    "apiKey": "YOUR_CRON_API_KEY"
  }'
```

### Option 3: Direct API Call (GET method with query params)

You can also use GET with query parameters:

```bash
curl -X GET "https://www.signalscouter.com/api/cron/auto-pilot?userEmail=your-email@example.com" \
  -H "Authorization: Bearer YOUR_CRON_API_KEY"
```

Or if you have `CRON_USER_EMAIL` set in environment variables:
```bash
curl -X GET "https://www.signalscouter.com/api/cron/auto-pilot" \
  -H "Authorization: Bearer YOUR_CRON_API_KEY"
```

## Notes

- The auto-pilot uses your saved keywords and subreddits from the database
- Results are filtered to posts from the last 2 hours
- The AI filter removes posts that don't match your product
- Comments are generated using the Founder persona with your product description and benefits
- Successfully posted comments are saved to the database and appear in Analytics/History
- Usage limits are checked and enforced before posting
- A 2-second delay is added between posts to avoid Reddit rate limiting

