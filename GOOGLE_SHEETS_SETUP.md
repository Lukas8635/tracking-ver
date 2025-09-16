# 📊 Google Sheets Integration Setup

This guide will help you set up Google Sheets integration for automatic export of GTM analysis results.

## 🚀 Quick Setup

Run the setup script to configure Google Sheets integration:

```bash
npm run setup-sheets
```

## 📋 Manual Setup

### Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Note your project ID

### Step 2: Enable Google Sheets API

1. In the Google Cloud Console, go to "APIs & Services" > "Library"
2. Search for "Google Sheets API"
3. Click on it and press "Enable"

### Step 3: Create Service Account

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "Service Account"
3. Fill in the service account details:
   - **Name**: `gtm-analyzer-service`
   - **Description**: `Service account for GTM analysis tool`
4. Click "Create and Continue"
5. Skip the optional steps and click "Done"

### Step 4: Generate Credentials

1. In the Credentials page, find your service account
2. Click on the service account email
3. Go to the "Keys" tab
4. Click "Add Key" > "Create new key"
5. Choose "JSON" format
6. Download the JSON file
7. Rename it to `credentials.json`
8. Place it in your project directory

### Step 5: Create Google Sheet

1. Go to [Google Sheets](https://sheets.google.com/)
2. Create a new spreadsheet
3. Name it "GTM Analysis Results" (or any name you prefer)
4. Copy the spreadsheet ID from the URL:
   ```
   https://docs.google.com/spreadsheets/d/SPREADSHEET_ID_HERE/edit
   ```

### Step 6: Share Sheet with Service Account

1. In your Google Sheet, click "Share" button
2. Add the service account email (found in your `credentials.json` file)
3. Give it "Editor" permissions
4. Click "Send"

### Step 7: Update Configuration

1. Open `config.json`
2. Set `googleSheets.enabled` to `true`
3. Set `googleSheets.spreadsheetId` to your spreadsheet ID
4. Set `googleSheets.sheetName` to your sheet name (default: "GTM Analysis Results")

## 🔧 Configuration Options

```json
{
  "googleSheets": {
    "enabled": true,
    "spreadsheetId": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
    "sheetName": "GTM Analysis Results",
    "credentialsFile": "credentials.json"
  }
}
```

## 📊 Exported Data

The tool will export the following data to your Google Sheet:

| Column | Description |
|--------|-------------|
| Website | The analyzed website URL |
| Status | Success or Error status |
| GTM Containers | Number of GTM containers found |
| GTM IDs | List of GTM container IDs |
| GA4 IDs | List of GA4 measurement IDs |
| Consent Mode | Consent Mode detection status |
| Consent Tool | Detected consent management tool |
| Tracking Type | Implementation type (client-side, server-side, etc.) |
| GTM Immediate Load | Whether GTM loads immediately |
| Cookieless Hits | Whether cookieless tracking works |
| Network Requests | Total number of network requests |
| Error Message | Any errors encountered |
| Analysis Date | Timestamp of the analysis |

## 🚨 Troubleshooting

### Common Issues

1. **"Credentials file not found"**
   - Make sure `credentials.json` is in the project directory
   - Check the filename matches `config.json` settings

2. **"Permission denied"**
   - Ensure the service account has access to the spreadsheet
   - Check that the spreadsheet ID is correct

3. **"API not enabled"**
   - Verify Google Sheets API is enabled in Google Cloud Console
   - Wait a few minutes for changes to propagate

4. **"Invalid spreadsheet ID"**
   - Double-check the spreadsheet ID from the URL
   - Ensure the spreadsheet exists and is accessible

### Testing the Setup

Run a test analysis to verify everything works:

```bash
npm start
```

Check your Google Sheet for the exported results!

## 🔒 Security Notes

- Keep your `credentials.json` file secure and never commit it to version control
- Add `credentials.json` to your `.gitignore` file
- The service account has minimal permissions (only access to the specific spreadsheet)

## 📝 Next Steps

Once set up, your analysis results will be automatically exported to Google Sheets every time you run the tool. You can:

- Create charts and visualizations from the data
- Set up automated reports
- Share the results with your team
- Track changes over time by running regular analyses
