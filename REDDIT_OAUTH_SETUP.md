# Reddit OAuth Setup Guide

This guide will help you set up Reddit OAuth to enable posting comments to Reddit.

## Prerequisites

- A Reddit account
- Access to Reddit app preferences

## Step 1: Create Reddit OAuth App

1. Go to [Reddit App Preferences](https://www.reddit.com/prefs/apps)
2. Scroll down and click **"create another app"** or **"create app"**
3. Fill in the form:
   - **Name**: Your app name (e.g., "Comment Tool")
   - **App type**: Select **"web app"**
   - **Description**: (Optional) Brief description of your app
   - **About URL**: (Optional) Your website URL
   - **Redirect URI**: 
     - For development: `http://localhost:3000/api/reddit/callback`
     - For production: `https://yourdomain.com/api/reddit/callback`
4. Click **"create app"**
5. Note down:
   - **Client ID** (under the app name, looks like random characters)
   - **Secret** (click "edit" to reveal it, looks like random characters)

## Step 2: Set Up Environment Variables

Add the following to your `.env.local` file:

```env
# Reddit OAuth Configuration
REDDIT_CLIENT_ID=your-reddit-client-id
REDDIT_CLIENT_SECRET=your-reddit-client-secret
```

## Step 3: Connect Reddit Account

Users need to connect their Reddit account before they can post comments. You'll need to implement a Reddit OAuth flow:

1. Redirect user to Reddit authorization URL
2. User authorizes your app
3. Reddit redirects back with authorization code
4. Exchange code for access and refresh tokens
5. Store tokens in MongoDB for the user

## Step 4: Post Comments

Once a user has connected their Reddit account, they can post comments using the "Post" button in the playground. The system will:

1. Check if user has valid access token
2. Refresh token if expired
3. Post comment to Reddit using the Reddit API
4. Move post to analytics on success

## API Endpoints

### POST `/api/reddit/post-comment`

Posts a comment to a Reddit post.

**Request Body:**
```json
{
  "thing_id": "t3_xxxxx",  // Reddit post ID (from postData.name)
  "text": "Your comment text here"
}
```

**Response:**
```json
{
  "success": true,
  "data": { ... }  // Reddit API response
}
```

## Error Handling

- If user doesn't have Reddit tokens: Returns 401 with message to connect Reddit account
- If token is expired: Automatically refreshes and retries
- If posting fails: Returns error message with details

## Security Notes

- Reddit tokens are stored securely in MongoDB
- Tokens are encrypted at rest (if MongoDB encryption is enabled)
- Access tokens are automatically refreshed when expired
- Refresh tokens are long-lived and stored securely

## Additional Resources

- [Reddit API Documentation](https://www.reddit.com/dev/api/)
- [Reddit OAuth Documentation](https://github.com/reddit-archive/reddit/wiki/OAuth2)
- [Reddit API Scopes](https://www.reddit.com/api/v1/scopes)

