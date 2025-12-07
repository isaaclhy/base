# Cron Job Setup for Reddit Post Search

This guide explains how to set up a cron job to automatically search for Reddit posts.

## Overview

The cron job calls the `/api/cron/search-reddit-posts` endpoint, which:
1. Gets the user's product details from the database
2. Generates search queries using OpenAI
3. Searches for Reddit posts using Google Custom Search
4. Fetches full post content from Reddit
5. Returns the results

## Setup Steps

### 1. Add API Key to Environment Variables

Add a secure API key to your `.env.local` file:

```bash
CRON_API_KEY=your-secure-random-api-key-here
```

Generate a secure key:
```bash
openssl rand -hex 32
```

### 2. Set Up Cron Job

You have several options for running the cron job:

#### Option A: Using a Cron Service (Recommended)

Use a service like:
- **Vercel Cron** (if deployed on Vercel)
- **GitHub Actions** (free, runs on schedule)
- **Cron-job.org** (free web-based cron)
- **EasyCron** (paid, more features)

#### Option B: Using Vercel Cron (Vercel Pro/Enterprise)

Create `vercel.json` in your project root:

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

Then call the endpoint with authentication:

```typescript
// In your cron handler
await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/cron/search-reddit-posts`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    userEmail: 'user@example.com',
    postCount: 10,
    apiKey: process.env.CRON_API_KEY,
  }),
});
```

#### Option C: Using GitHub Actions (Free)

Create `.github/workflows/reddit-search.yml`:

```yaml
name: Search Reddit Posts

on:
  schedule:
    # Run daily at 9 AM UTC
    - cron: '0 9 * * *'
  workflow_dispatch: # Allow manual trigger

jobs:
  search:
    runs-on: ubuntu-latest
    steps:
      - name: Call Cron Endpoint
        run: |
          curl -X POST https://your-domain.com/api/cron/search-reddit-posts \
            -H "Content-Type: application/json" \
            -d '{
              "userEmail": "user@example.com",
              "postCount": 10,
              "apiKey": "${{ secrets.CRON_API_KEY }}"
            }'
```

Add `CRON_API_KEY` to your GitHub repository secrets.

#### Option D: Using Cron-job.org

1. Sign up at https://cron-job.org
2. Create a new cron job
3. Set the URL to: `https://your-domain.com/api/cron/search-reddit-posts`
4. Set method to POST
5. Add headers: `Content-Type: application/json`
6. Add body:
```json
{
  "userEmail": "user@example.com",
  "postCount": 10,
  "apiKey": "your-api-key"
}
```
7. Set schedule (e.g., daily at 9 AM)

### 3. API Endpoint Usage

The endpoint accepts the following parameters:

```typescript
{
  userEmail?: string;      // Required if using API key auth
  productIdea?: string;   // Optional: overrides saved product description
  postCount?: number;      // Optional: defaults to 10
  apiKey?: string;         // Required for service-to-service calls
}
```

### 4. Response Format

```json
{
  "success": true,
  "message": "Found 10 Reddit posts",
  "posts": [
    {
      "title": "Post title",
      "link": "https://reddit.com/r/...",
      "snippet": "Post snippet",
      "selftext": "Full post text",
      "postData": {
        "created_utc": 1234567890,
        "subreddit": "subredditname",
        "author": "username"
      }
    }
  ],
  "queriesUsed": 5
}
```

## Security Considerations

1. **API Key**: Always use a strong, randomly generated API key
2. **HTTPS**: Only call the endpoint over HTTPS
3. **Rate Limiting**: Consider adding rate limiting to prevent abuse
4. **User Validation**: The endpoint validates that the user exists in the database

## Testing

Test the endpoint manually:

```bash
curl -X POST http://localhost:3000/api/cron/search-reddit-posts \
  -H "Content-Type: application/json" \
  -d '{
    "userEmail": "test@example.com",
    "postCount": 5,
    "apiKey": "your-api-key"
  }'
```

## Next Steps

After setting up the cron job, you may want to:
1. Store the results in the database automatically
2. Auto-generate comments for the posts
3. Send notifications when new posts are found
4. Add error handling and retry logic

