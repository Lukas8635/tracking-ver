# 🔍 GTM & GA4 Tracking Analysis Tool

A comprehensive Node.js application that analyzes Google Tag Manager (GTM) and Google Analytics 4 (GA4) implementations across multiple websites. This tool helps identify tracking issues, consent mode implementations, and provides detailed analytics debugging similar to browser extensions.

## 🚀 Features

### 📊 **Analytics Detection**
- **GTM Container IDs** - Detects all GTM containers from network requests, page content, and window objects
- **GA4 Measurement IDs** - Finds GA4 tracking IDs from various sources including custom endpoints
- **Server-side Analytics** - Identifies custom analytics endpoints and server-side implementations
- **Tracking Type Classification** - Determines implementation type (client-side GTM, server-side GA4, etc.)

### 🍪 **Consent & Privacy Analysis**
- **Consent Mode Detection** - Identifies Google Consent Mode v1/v2 implementation
- **Consent Tools** - Detects popular consent management platforms (Cookiebot, OneTrust, TrustArc, etc.)
- **Consent States** - Shows detailed consent category statuses (analytics_storage, ad_storage, etc.)
- **Privacy Compliance** - Analyzes cookieless tracking and consent-blocked scenarios

### 🐛 **Advanced Analytics Debugging**
- **DataLayer Events** - Captures all dataLayer.push() events in real-time
- **gtag() Function Calls** - Monitors all gtag() commands and parameters
- **eCommerce Tracking** - Detects and reports eCommerce events and transaction data
- **Custom Dimensions & Metrics** - Identifies custom tracking parameters
- **Network Request Analysis** - Monitors all analytics-related network traffic

### 🤖 **Bot Detection Evasion**
- **Realistic Browser Simulation** - Uses authentic user agents and browser settings
- **Human-like Interactions** - Simulates scrolling, mouse movements, and clicks
- **Stealth Mode** - Bypasses common bot detection mechanisms

### 📈 **Multi-Site Analysis**
- **Batch Processing** - Analyzes multiple websites sequentially
- **Comparative Reports** - Provides side-by-side analysis results
- **Error Monitoring** - Tracks console errors and failed requests
- **Detailed Logging** - Comprehensive output with emoji-enhanced readability

### 📊 **Google Sheets Integration**
- **Automatic Export** - Results automatically exported to Google Sheets
- **Structured Data** - Organized columns for easy analysis and reporting
- **Historical Tracking** - Timestamped results for trend analysis
- **Team Collaboration** - Share results with stakeholders easily

### 🌐 **Web UI Interface**
- **Modern Interface** - Clean, responsive web application
- **Multiple URL Support** - Analyze one or multiple websites at once
- **Flexible Input** - Enter URLs separated by commas or new lines
- **Google Sheets Integration** - Results automatically added to your Google Sheets
- **Real-time Analysis** - Live progress tracking during analysis
- **Detailed Results Display** - See analysis results directly in the web interface
- **Batch Processing** - Efficiently analyze multiple sites in sequence
- **Mobile Friendly** - Works on desktop, tablet, and mobile devices

## 🛠️ Prerequisites

- **Node.js** (version 14 or higher)
- **npm** (comes with Node.js)

## 📦 Installation

1. **Clone or download** the project files
2. **Navigate** to the project directory:
   ```bash
   cd "GTM tracking"
   ```
3. **Install dependencies**:
   ```bash
   npm install
   ```

## 🎯 How to Run

### **🌐 Web UI (Recommended)**
Launch the modern web interface for easy URL input and Excel export:
```bash
npm run web
```
Then open your browser and go to: `http://localhost:3000`

### **📊 Command Line Analysis**
Analyze websites from the configuration file:
```bash
npm start
```

### **Alternative Methods**
```bash
# Direct execution
node app.js

# With custom timeout (if needed)
node app.js --timeout=180000
```

## ⚙️ Configuration

### **Adding Websites to Analyze**

Edit the `websites` array in `config.json`:

```json
{
  "websites": [
    "https://your-website.com/",
    "https://another-site.com/",
    "https://example.com/"
  ]
}
```

### **Google Sheets Integration**

Enable automatic export to Google Sheets:

```bash
npm run setup-sheets
```

Or manually configure in `config.json`:

```json
{
  "googleSheets": {
    "enabled": true,
    "spreadsheetId": "your-google-sheets-id",
    "sheetName": "GTM Analysis Results",
    "credentialsFile": "credentials.json"
  }
}
```

See [GOOGLE_SHEETS_SETUP.md](GOOGLE_SHEETS_SETUP.md) for detailed setup instructions.

### **Adjusting Analysis Settings**

Modify these parameters in `config.json`:

```json
{
  "analysis": {
    "timeout": 120000,
    "waitTime": 15000,
    "headless": true
  }
}
```

- **timeout**: Page load timeout in milliseconds
- **waitTime**: Additional wait time for tracking requests
- **headless**: Run browser in headless mode (true/false)

## 📋 What the Tool Analyzes

### 🔍 **For Each Website:**

1. **GTM Implementation**
   - Container IDs from network requests
   - GTM loading patterns and timing
   - DataLayer configuration and events

2. **GA4 Setup**
   - Measurement IDs from all sources
   - Client-side vs server-side implementation
   - Custom analytics endpoints

3. **Consent Management**
   - Consent Mode version detection
   - Consent tool identification
   - Default consent states analysis
   - Category-specific consent status

4. **Analytics Events**
   - Real-time event capturing
   - eCommerce transaction tracking
   - Custom dimension usage
   - Consent command monitoring

5. **Technical Issues**
   - Console errors affecting tracking
   - Failed network requests
   - Bot detection interference

## 📊 Understanding the Output

### **Individual Site Analysis**
```
🔍 ANALYZING: https://example.com/
================================================================================
✅ Page loaded (Status: 200), waiting for additional requests...
📊 Found GTM ID (pattern 1): GTM-XXXXXXX
📈 Captured GA request: https://www.google-analytics.com/g/collect?tid=G-XXXXXXX
🍪 Consent Mode detected: ✅ Yes (v2)
🛡️ Consent Tool: Cookiebot
```

### **Comparative Summary**
```
🏆🏆 COMPARATIVE ANALYSIS 🏆🏆

📊 RESULTS SUMMARY:

1. https://example.com/
   🏷️ GTM Containers: 1 (GTM-XXXXXXX)
   📊 GA4 IDs: 1 (G-XXXXXXX)
   🍪 Consent Mode: ✅ v2
   🛡️ Consent Tool: Cookiebot
   📈 Tracking Type: GTM (client-side)
   🚀 GTM Immediate Load: ✅
   🍪 Cookieless Hits: ✅
```

### **Key Metrics Explained**

| Metric | Description |
|--------|-------------|
| **GTM Containers** | Number of unique GTM container IDs found |
| **GA4 IDs** | Number of unique GA4 Measurement IDs detected |
| **Consent Mode** | Google Consent Mode implementation status |
| **Consent Tool** | Detected consent management platform |
| **Tracking Type** | Implementation method (client-side, server-side, etc.) |
| **GTM Immediate Load** | Whether GTM loads before consent |
| **Cookieless Hits** | Whether analytics works without cookies |

## 🔧 Technical Details

### **Technologies Used**
- **Playwright** - Browser automation and network monitoring
- **Chromium** - Headless browser engine
- **Node.js** - Runtime environment

### **Detection Methods**
1. **Network Request Interception** - Monitors all HTTP requests
2. **Page Content Scraping** - Analyzes HTML for tracking codes
3. **JavaScript Injection** - Debugs analytics events in real-time
4. **Window Object Inspection** - Checks global variables and functions

### **Browser Configuration**
- **User Agent**: Latest Chrome on macOS
- **Viewport**: 1920x1080 (desktop)
- **Locale**: en-US
- **Timezone**: Europe/London
- **Stealth Features**: Anti-bot detection measures

## 🚨 Common Issues & Solutions

### **Timeout Errors**
- Increase timeout in `page.goto()` options
- Some sites have continuous network activity

### **Missing Tracking Data**
- Site may use server-side analytics only
- Consent tools might block all tracking
- Bot detection may prevent script execution

### **Console Errors**
- Usually don't affect analysis results
- Can indicate tracking implementation issues

## 📈 Use Cases

- **Analytics Audits** - Verify tracking implementation across multiple sites
- **Consent Compliance** - Check GDPR/privacy regulation compliance
- **Competitive Analysis** - Understand competitor tracking strategies
- **Migration Testing** - Validate GA4 migrations and GTM setups
- **Performance Monitoring** - Identify tracking-related performance issues

## 🎯 Next Steps

After running the analysis, you can:

1. **Fix Implementation Issues** - Address missing GTM containers or GA4 IDs
2. **Implement Consent Mode** - Add Google Consent Mode for privacy compliance
3. **Optimize Loading** - Ensure GTM loads immediately for better data collection
4. **Add Server-side Tracking** - Implement server-side GA4 for better data quality
5. **Monitor Regularly** - Set up automated checks for tracking health

## 📄 Sample Output Files

The tool outputs directly to console, but you can redirect to files:

```bash
# Save full output to file
npm start > analysis-results.txt 2>&1

# Save only summary
npm start | grep "RESULTS SUMMARY" -A 50 > summary.txt
```

---

**Made with ❤️ for better analytics implementation** 