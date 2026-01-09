# Testing Auto-Pilot Cron Job Locally

## Prerequisites

1. **Environment Variables** - Make sure you have these set in your `.env.local` file:
   ```bash
   CRON_SECRET_TOKEN=your-secret-token-here
   OPENAI_API_KEY=your-openai-api-key
   GCS_KEY=your-google-custom-search-api-key
   MONGODB_URI=your-mongodb-connection-string
   ```

2. **User Setup** - You need at least one user in your database with:
   - `autoPilotEnabled: true`
   - `keywords`: Array of keywords (e.g., `["SaaS", "startup"]`)
   - `productDetails.productDescription`: A product description string
   - Reddit OAuth tokens (for fetching Reddit post data)

## Steps to Test

### Step 1: Enable Auto-Pilot for Your User

You can either:
- **Option A**: Use the UI - Go to Dashboard, toggle the Auto-pilot switch ON
- **Option B**: Directly update the database:
  ```javascript
  // In MongoDB or using MongoDB Compass
  db.usersv2.updateOne(
    { email: "your-email@example.com" },
    { 
      $set: { 
        autoPilotEnabled: true,
        keywords: ["SaaS", "startup", "entrepreneur"],
        productDetails: {
          productDescription: "A SaaS tool for automating Reddit engagement"
        }
      }
    }
  )
  ```

### Step 2: Start Your Local Development Server

```bash
npm run dev
# or
yarn dev
```

Your server should be running at `http://localhost:3000`

### Step 3: Make a POST Request to the Endpoint

Use curl (or any HTTP client like Postman):

```bash
curl -X POST http://localhost:3000/api/cron/auto-pilot \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secret-token-here"
```

Replace `your-secret-token-here` with the same value you set in `CRON_SECRET_TOKEN` in your `.env.local`.

### Step 4: Check the Response

You should see a JSON response like:

```json
{
  "success": true,
  "message": "Processed 1/1 users",
  "processed": 1,
  "total": 1,
  "totalNewLeads": 5,
  "results": [
    {
      "email": "your-email@example.com",
      "success": true,
      "newLeads": 5
    }
  ]
}
```

### Step 5: Check Server Logs

In your terminal where you're running `npm run dev`, you should see detailed logs:

```
[Auto-Pilot Cron] Starting auto-pilot cron job...
[Auto-Pilot Cron] Found 1 users with auto-pilot enabled
[Auto-Pilot] Processing user: your-email@example.com
[Auto-Pilot] User your-email@example.com: Expanded 3 keywords to 15
[Auto-Pilot] User your-email@example.com: Found 45 total search results
[Auto-Pilot] User your-email@example.com: 30 unique results after deduplication
[Auto-Pilot] User your-email@example.com: 25 posts to filter
[Auto-Pilot] User your-email@example.com: 5 YES posts out of 25 total posts
[Auto-Pilot] User your-email@example.com - YES Reddit Posts: [
  {
    "id": "abc123",
    "title": "Looking for a SaaS solution...",
    "url": "https://reddit.com/r/..."
  },
  ...
]
[Auto-Pilot Cron] Completed: 1/1 users processed, 5 new leads found
```

## Troubleshooting

### Error: "Unauthorized"
- Make sure `CRON_SECRET_TOKEN` is set in your `.env.local` file
- Make sure the token in the Authorization header matches exactly (including the `Bearer ` prefix)

### Error: "No users with auto-pilot enabled"
- Verify your user has `autoPilotEnabled: true` in the database
- Check that you're querying the correct email/user

### Error: "No keywords" or "No product description"
- Make sure your user document has:
  - `keywords` array with at least one keyword
  - `productDetails.productDescription` set to a non-empty string

### No Results / 0 new leads
- This is normal if there are no posts from the past 12 hours that match your keywords
- Check the logs to see how many posts were found and filtered
- Try with different keywords or check if there are recent Reddit posts matching your keywords

## Testing with Different Scenarios

### Test with Multiple Users
Enable auto-pilot for multiple users and see how the cron job processes them all:

```bash
# Enable for user 1
db.usersv2.updateOne({ email: "user1@example.com" }, { $set: { autoPilotEnabled: true } })

# Enable for user 2
db.usersv2.updateOne({ email: "user2@example.com" }, { $set: { autoPilotEnabled: true } })
```

### Test Error Handling
Temporarily break something (e.g., wrong API key) and verify error handling works correctly.

### Monitor Performance
Check how long the job takes and optimize if needed. The timeout is set to 30 minutes in the GitHub Actions workflow.

## Alternative: Create a Test Script

You can also create a simple test script:

```javascript
// test-auto-pilot.js
const fetch = require('node-fetch');

async function testAutoPilot() {
  const response = await fetch('http://localhost:3000/api/cron/auto-pilot', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.CRON_SECRET_TOKEN}`
    }
  });

  const data = await response.json();
  console.log(JSON.stringify(data, null, 2));
}

testAutoPilot().catch(console.error);
```

Run with: `node test-auto-pilot.js` (make sure CRON_SECRET_TOKEN is in your environment)

