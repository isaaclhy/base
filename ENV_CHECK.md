# Environment Variables Checklist

To fix the "Server error - There is a problem with the server configuration" error, make sure all these environment variables are set in your `.env.local` file:

## Required for Sign In:

### 1. NextAuth Configuration
```env
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-key-here
```

**To generate NEXTAUTH_SECRET:**
```bash
openssl rand -base64 32
```

### 2. Google OAuth Credentials
```env
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

Get these from: https://console.cloud.google.com/apis/credentials

### 3. MongoDB Connection
```env
MONGO_URL=your-mongodb-connection-string
```

## Quick Check:

Run this command to verify your environment variables are loaded:
```bash
node -e "console.log('NEXTAUTH_SECRET:', process.env.NEXTAUTH_SECRET ? 'SET' : 'MISSING'); console.log('GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID ? 'SET' : 'MISSING'); console.log('GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET ? 'SET' : 'MISSING'); console.log('NEXTAUTH_URL:', process.env.NEXTAUTH_URL || 'MISSING');"
```

But remember: `.env.local` files are only loaded by Next.js at runtime, not by Node directly.

## After setting variables:
1. **Restart your dev server** (environment variables are only loaded at startup)
2. **Check server logs** for specific error messages
3. **Verify Google OAuth redirect URIs** match exactly:
   - `http://localhost:3000/api/auth/callback/google` (development)
   - `https://yourdomain.com/api/auth/callback/google` (production)

