# 🚀 Vercel Deployment Guide

## Prerequisites

1. **GitHub Account** - You'll need a GitHub account
2. **Vercel Account** - Sign up at vercel.com
3. **Google Cloud Project** - For Google Sheets API access

## Step 1: Prepare Your Code

Your code is already prepared for Vercel deployment with:
- ✅ `vercel.json` configuration
- ✅ `vercel-server.js` (Vercel-compatible server)
- ✅ Updated `package.json`
- ✅ `.gitignore` file

## Step 2: Push to GitHub

```bash
# Initialize git repository
git init

# Add all files
git add .

# Commit changes
git commit -m "Initial commit - GTM Tracking Analysis Tool"

# Create GitHub repository and push
git remote add origin https://github.com/YOUR_USERNAME/gtm-tracker.git
git push -u origin main
```

## Step 3: Deploy on Vercel

1. **Go to Vercel**: https://vercel.com
2. **Sign up/Login** with your GitHub account
3. **Click "New Project"**
4. **Import your repository** from GitHub
5. **Configure Environment Variables** (see Step 4 below)
6. **Deploy!**

## Step 4: Environment Variables

In your Vercel dashboard, go to **Settings > Environment Variables** and add:

### Required Variables:
```
GOOGLE_SHEETS_ENABLED=true
SPREADSHEET_ID=your-google-sheets-id
SHEET_NAME=GTM tracking
GOOGLE_SHEETS_CREDENTIALS=base64-encoded-credentials
```

### Optional Variables:
```
ANALYSIS_TIMEOUT=120000
ANALYSIS_WAIT_TIME=15000
```

## Step 5: Google Sheets Credentials

### Option A: Use Service Account (Recommended)
1. Go to Google Cloud Console
2. Create a service account
3. Download the JSON key file
4. Convert to base64:
   ```bash
   base64 -i credentials.json
   ```
5. Use the base64 string as `GOOGLE_SHEETS_CREDENTIALS`

### Option B: Use OAuth (More Complex)
- Requires additional setup for OAuth flow
- Not recommended for serverless deployment

## Step 6: Test Your Deployment

1. **Visit your Vercel URL**: `https://your-project.vercel.app`
2. **Enter a test URL**: `https://example.com`
3. **Click "Analyze Websites"**
4. **Check your Google Sheets** for results

## Important Notes

### Vercel Limitations:
- **5-minute timeout** for serverless functions
- **Limited to 3 URLs** per analysis (to stay within timeout)
- **No persistent file storage** (use environment variables)

### Browser Automation:
- Uses Puppeteer with Chrome AWS Lambda
- Automatically handles browser binaries
- Optimized for serverless environment

### Google Sheets Integration:
- Results are added in real-time
- Each analysis creates a new row
- Headers are automatically created

## Troubleshooting

### Common Issues:

1. **Timeout Errors**
   - Reduce number of URLs analyzed
   - Increase `ANALYSIS_WAIT_TIME` environment variable

2. **Google Sheets Errors**
   - Check credentials format (must be base64)
   - Verify spreadsheet permissions
   - Ensure service account has access

3. **Browser Launch Errors**
   - Vercel automatically handles browser binaries
   - Check function logs in Vercel dashboard

### Debugging:
- Check **Vercel Function Logs** in dashboard
- Use **console.log** statements for debugging
- Test locally with `npm run dev`

## Custom Domain (Optional)

1. **Go to Vercel Dashboard**
2. **Settings > Domains**
3. **Add your domain**
4. **Update DNS records** as instructed

## Monitoring

- **Vercel Analytics**: Built-in performance monitoring
- **Function Logs**: Real-time error tracking
- **Google Sheets**: Track analysis results

## Cost

- **Vercel**: Free tier includes 100GB bandwidth/month
- **Google Sheets API**: Free for reasonable usage
- **Browser Automation**: Included in Vercel free tier

Your GTM Tracking Analysis Tool is now live on the internet! 🎉
