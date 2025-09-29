const express = require('express');
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-core');
const { google } = require('googleapis');

// Import chromium only when needed
let chromium;
if (process.env.NODE_ENV === 'production') {
  chromium = require('chrome-aws-lambda');
}

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Load configuration from environment variables (Vercel)
let config;
try {
  // Try to load from file first (for local development)
  config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
} catch (error) {
  // Use environment variables for Vercel
  config = {
    googleSheets: {
      enabled: process.env.GOOGLE_SHEETS_ENABLED === 'true',
      stream: true,
      spreadsheetId: process.env.SPREADSHEET_ID,
      sheetName: process.env.SHEET_NAME || 'GTM tracking',
      credentialsFile: 'credentials.json'
    },
    analysis: {
      timeout: parseInt(process.env.ANALYSIS_TIMEOUT) || 120000,
      waitTime: parseInt(process.env.ANALYSIS_WAIT_TIME) || 15000,
      headless: true
    }
  };
}

// Google Sheets helpers
const streamMode = config.googleSheets && (config.googleSheets.stream === undefined ? true : !!config.googleSheets.stream);
let cachedSheetsClient = null;
let headerInitialized = false;

async function getSheetsClient() {
  if (!config.googleSheets.enabled) return null;
  if (cachedSheetsClient) return cachedSheetsClient;
  
  let auth;
  if (process.env.GOOGLE_SHEETS_CREDENTIALS) {
    // Use environment variable credentials (base64 encoded)
    const credentials = JSON.parse(Buffer.from(process.env.GOOGLE_SHEETS_CREDENTIALS, 'base64').toString());
    auth = new google.auth.GoogleAuth({
      credentials: credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  } else {
    // Use file-based credentials (local development)
    auth = new google.auth.GoogleAuth({
      keyFile: config.googleSheets.credentialsFile,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }
  
  cachedSheetsClient = google.sheets({ version: 'v4', auth });
  return cachedSheetsClient;
}

function getA1SheetName(name) {
  const escaped = String(name || '').replace(/'/g, "''");
  return `'${escaped}'`;
}

async function ensureHeaderRow() {
  const sheets = await getSheetsClient();
  if (!sheets || headerInitialized) return;
  const sheetA1 = getA1SheetName(config.googleSheets.sheetName);
  try {
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: config.googleSheets.spreadsheetId,
      range: `${sheetA1}!A1:A1`,
    });
    const hasHeader = Array.isArray(existing.data.values) && existing.data.values.length > 0;
    if (!hasHeader) {
      const headers = [
        'Website','Status','GTM Containers','GTM IDs','GA4 IDs','Consent Mode','Consent Tool','Tracking Type','GTM Immediate Load','Cookieless Hits','Network Requests','Error Message','Analysis Date'
      ];
      await sheets.spreadsheets.values.update({
        spreadsheetId: config.googleSheets.spreadsheetId,
        range: `${sheetA1}!A1`,
        valueInputOption: 'RAW',
        resource: { values: [headers] }
      });
    }
    headerInitialized = true;
  } catch (e) {
    // Ignore errors
  }
}

async function appendResultRow(result) {
  const sheets = await getSheetsClient();
  if (!sheets) return;
  await ensureHeaderRow();
  const sheetA1 = getA1SheetName(config.googleSheets.sheetName);
  const row = [
    result.website,
    result.error ? 'Error' : 'Success',
    result.gtmIds ? result.gtmIds.length : 0,
    result.gtmIds ? result.gtmIds.join(', ') : 'None',
    result.ga4Ids ? result.ga4Ids.join(', ') : 'None',
    result.consentMode ? `${result.consentMode.detected ? 'Yes' : 'No'} ${result.consentMode.version}` : 'Unknown',
    result.consentMode ? result.consentMode.tool : 'Unknown',
    result.trackingType || 'Unknown',
    result.gtmLoadedInitially ? 'Yes' : 'No',
    result.gaCookielessHits ? 'Yes' : 'No',
    result.networkRequests || 0,
    result.error || '',
    new Date().toISOString()
  ];
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.googleSheets.spreadsheetId,
    range: `${sheetA1}!A:A`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    resource: { values: [row] },
  });
}

// Analysis function using Puppeteer
async function analyzeWebsite(browser, website) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔍 ANALYZING: ${website}`);
  console.log(`${'='.repeat(80)}`);
  
  const page = await browser.newPage();
  
  // Monitor console errors
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });
  
  // Monitor failed requests
  const failedRequests = [];
  page.on('requestfailed', request => {
    failedRequests.push({
      url: request.url(),
      failure: request.failure().errorText
    });
  });
  
  // Add analytics debugging capabilities
  await page.evaluateOnNewDocument(() => {
    // Analytics Debugger: Capture all analytics events
    window._analyticsDebugger = {
      events: [],
      dataLayerEvents: [],
      gtagCalls: [],
      consentEvents: [],
      ecommerceEvents: [],
      customDimensions: new Set(),
      customMetrics: new Set()
    };

    // Intercept dataLayer pushes
    const originalDataLayer = window.dataLayer || [];
    window.dataLayer = new Proxy(originalDataLayer, {
      set(target, property, value) {
        if (property === 'length' && typeof value === 'number') {
          const newItem = target[value - 1];
          if (newItem) {
            window._analyticsDebugger.dataLayerEvents.push({
              timestamp: Date.now(),
              event: newItem,
              eventName: newItem.event || 'unnamed',
              type: 'dataLayer.push'
            });

            if (newItem.ecommerce || newItem.items || 
                ['purchase', 'add_to_cart', 'remove_from_cart', 'view_item', 'begin_checkout'].includes(newItem.event)) {
              window._analyticsDebugger.ecommerceEvents.push({
                timestamp: Date.now(),
                event: newItem,
                eventName: newItem.event || 'ecommerce_event',
                type: 'ecommerce'
              });
            }

            Object.keys(newItem).forEach(key => {
              if (key.startsWith('custom_') || key.startsWith('user_')) {
                window._analyticsDebugger.customDimensions.add(key);
              }
            });
          }
        }
        return Reflect.set(target, property, value);
      }
    });

    // Intercept gtag function calls
    const originalGtag = window.gtag;
    window.gtag = function(...args) {
      const parameters = args[2] || {};
      
      window._analyticsDebugger.gtagCalls.push({
        timestamp: Date.now(),
        command: args[0],
        targetId: args[1],
        parameters: parameters,
        type: 'gtag'
      });

      if (args[0] === 'consent') {
        window._analyticsDebugger.consentEvents.push({
          timestamp: Date.now(),
          action: args[1],
          consent_types: parameters,
          type: 'consent'
        });
      }

      if (originalGtag) {
        return originalGtag.apply(this, args);
      }
    };
  });

  // Network monitoring
  const networkRequests = [];
  const summary = { gtm: 0, ga: 0, other: 0 };
  const gtmIds = new Set();
  const ga4Ids = new Set();
  let consentToolStates = { tool: 'Unknown', states: {}, rawData: null };

  page.on('request', request => {
    const url = request.url();
    
    if (url.includes('googletagmanager.com')) {
      summary.gtm++;
      networkRequests.push(url);
      
      const gtmMatch1 = url.match(/[?&]id=(GTM-[A-Z0-9]+)/i);
      const gtmMatch2 = url.match(/\/gtm\.js\?id=(GTM-[A-Z0-9]+)/i);
      const gtmMatch3 = url.match(/(GTM-[A-Z0-9]+)/g);
      
      if (gtmMatch1) gtmIds.add(gtmMatch1[1]);
      if (gtmMatch2) gtmIds.add(gtmMatch2[1]);
      if (gtmMatch3) {
        gtmMatch3.forEach(id => {
          if (id.startsWith('GTM-')) gtmIds.add(id);
        });
      }
      
      const ga4FromGtmMatch = url.match(/[?&]id=(G-[A-Z0-9]+)/i);
      if (ga4FromGtmMatch) ga4Ids.add(ga4FromGtmMatch[1]);
    } 
    else if (url.includes('google-analytics.com')) {
      summary.ga++;
      networkRequests.push(url);
      
      const ga4Match = url.match(/[?&]tid=(G-[A-Z0-9]+)/i);
      if (ga4Match) ga4Ids.add(ga4Match[1]);
    }
    else if (url.includes('/g/collect') || url.includes('analytics.') || url.match(/[?&]tid=(G-[A-Z0-9]+)/)) {
      const ga4Match = url.match(/[?&]tid=(G-[A-Z0-9]+)/i);
      if (ga4Match) {
        summary.ga++;
        networkRequests.push(url);
        ga4Ids.add(ga4Match[1]);
      } else {
        summary.other++;
      }
    }
    else {
      summary.other++;
    }
  });

  try {
    await page.goto(website, { 
      waitUntil: 'load', 
      timeout: config.analysis.timeout
    });
    
    const title = await page.title();
    
    await page.waitForTimeout(3000);
    
    // Simulate human behavior
    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(2000);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(2000);
    
    await page.waitForTimeout(config.analysis.waitTime);
    
    // Extract additional GTM IDs from page content
    const gtmFromWindow = await page.evaluate(() => {
      const foundIds = new Set();
      
      if (window.google_tag_manager) {
        Object.keys(window.google_tag_manager).forEach(key => {
          if (key.match(/GTM-[A-Z0-9]+/)) foundIds.add(key);
        });
      }
      
      if (window.dataLayer) {
        const dataLayerString = JSON.stringify(window.dataLayer);
        const gtmMatches = dataLayerString.match(/GTM-[A-Z0-9]+/g);
        if (gtmMatches) gtmMatches.forEach(id => foundIds.add(id));
      }
      
      return Array.from(foundIds);
    });
    
    if (gtmFromWindow.length > 0) {
      gtmFromWindow.forEach(id => gtmIds.add(id));
    }

    // Check consent tool states
    try {
      consentToolStates = await page.evaluate(() => {
        const result = { tool: 'Unknown', states: {}, rawData: null };

        if (typeof window.Cookiebot !== 'undefined') {
          result.tool = 'Cookiebot';
          try {
            const consent = window.Cookiebot.consent;
            result.states = {
              necessary: consent.necessary || false,
              preferences: consent.preferences || false,
              statistics: consent.statistics || false,
              marketing: consent.marketing || false
            };
          } catch (e) {
            result.states = { error: e.message };
          }
        }
        else if (typeof window.OnetrustActiveGroups !== 'undefined' || typeof window.OneTrust !== 'undefined') {
          result.tool = 'OneTrust';
          try {
            const activeGroups = window.OnetrustActiveGroups || '';
            result.states = {
              strictly_necessary: activeGroups.includes('C0001'),
              performance: activeGroups.includes('C0002'),
              functional: activeGroups.includes('C0003'),
              targeting: activeGroups.includes('C0004')
            };
          } catch (e) {
            result.states = { error: e.message };
          }
        }

        return result;
      });
    } catch (e) {
      // Ignore consent errors
    }
     
  } catch (error) {
    await page.close();
    return {
      website,
      error: error.message,
      summary: null
    };
  }

  const gtmLoadedInitially = networkRequests.some(url => url.includes('googletagmanager.com/gtm.js'));
  const gaCookielessHits = networkRequests.some(url => url.includes('google-analytics.com') && url.includes('gcs=G100'));

  // Consent Mode detection
  let consentModeDetected = false;
  let consentModeVersion = "Unknown";
  let consentTool = "Unknown";

  for (const url of networkRequests) {
    if (url.includes('gcs=G100') || url.includes('gcs=G110')) {
      consentModeDetected = true;
      consentModeVersion = "v2";
      break;
    } else if (url.includes('gcs=')) {
      consentModeDetected = true;
      consentModeVersion = "v1";
      break;
    }
  }

  // Detect consent tool
  const pageContent = await page.content();
  if (pageContent && pageContent.includes('cookiebot.com')) {
    consentTool = "Cookiebot";
  } else if (pageContent && pageContent.includes('onetrust.com')) {
    consentTool = "OneTrust";
  } else if (pageContent && pageContent.includes('trustarc.com')) {
    consentTool = "TrustArc";
  } else if (pageContent && pageContent.includes('quantcast.mgr')) {
    consentTool = "Quantcast";
  }

  // Determine tracking type
  let trackingType = "Unknown";
  const hasCustomAnalytics = networkRequests.some(url => 
    (url.includes('/g/collect') && !url.includes('google-analytics.com')) || 
    url.includes('analytics.') || 
    (url.match(/[?&]tid=(G-[A-Z0-9]+)/) && !url.includes('google-analytics.com'))
  );
  
  if (networkRequests.some(url => url.includes('googletagmanager.com/gtm.js'))) {
    trackingType = "GTM (client-side)";
  } else if (hasCustomAnalytics && ga4Ids.size > 0) {
    trackingType = "GA4 Server-Side (custom endpoint)";
  } else if (networkRequests.some(url => url.includes('googletagmanager.com/gtag/js')) && ga4Ids.size > 0) {
    trackingType = "GA4 gtag.js (client-side)";
  } else if (networkRequests.some(url => url.includes('google-analytics.com'))) {
    trackingType = "Google Analytics (client-side)";
  } else if (summary.gtm === 0 && summary.ga === 0 && ga4Ids.size === 0) {
    trackingType = "Possibly server-side (no GTM/GA requests detected)";
  } else if (ga4Ids.size > 0 && summary.ga === 0) {
    trackingType = "GA4 loaded but consent-blocked";
  }

  await page.close();

  return {
    website,
    summary,
    gtmIds: Array.from(gtmIds),
    ga4Ids: Array.from(ga4Ids),
    consentMode: {
      detected: consentModeDetected,
      version: consentModeVersion,
      tool: consentTool,
      states: {}
    },
    consentToolStates: consentToolStates,
    trackingType,
    gtmLoadedInitially,
    gaCookielessHits,
    networkRequests: networkRequests.length,
    error: null
  };
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/analyze', async (req, res) => {
  const { urls } = req.body;
  
  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: 'At least one URL is required' });
  }

  // Validate all URLs
  const invalidUrls = [];
  for (const url of urls) {
    try {
      new URL(url);
    } catch (e) {
      invalidUrls.push(url);
    }
  }
  
  if (invalidUrls.length > 0) {
    return res.status(400).json({ error: `Invalid URLs found: ${invalidUrls.join(', ')}` });
  }

  try {
    // Launch browser with Vercel-compatible settings
    const isProd = process.env.NODE_ENV === 'production' && chromium;
    const launchOptions = isProd ? {
      args: chromium.args,
      executablePath: await chromium.executablePath,
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
      defaultViewport: { width: 1920, height: 1080 }
    } : {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--single-process'
      ],
      ignoreHTTPSErrors: true,
      defaultViewport: { width: 1920, height: 1080 }
    };

    const browser = await puppeteer.launch(launchOptions);

    const results = [];
    let totalSheetsSuccess = 0;
    let totalSheetsErrors = 0;

    // Analyze each website (limit to 3 for Vercel timeout)
    const urlsToProcess = urls.slice(0, 3);
    
    for (let i = 0; i < urlsToProcess.length; i++) {
      const url = urlsToProcess[i];
      console.log(`\n📊 Processing ${i + 1}/${urlsToProcess.length}: ${url}`);
      
      try {
        const result = await analyzeWebsite(browser, url);
        
        // Export to Google Sheets
        let sheetsSuccess = false;
        let sheetsError = null;
        
        if (config.googleSheets.enabled) {
          try {
            await appendResultRow(result);
            sheetsSuccess = true;
            totalSheetsSuccess++;
            console.log(`📤 Result exported to Google Sheets: ${url}`);
          } catch (e) {
            sheetsError = e.message;
            totalSheetsErrors++;
            console.error(`❌ Failed to export result for ${url}: ${e.message}`);
          }
        }

        const resultData = {
          website: result.website,
          analysis: {
            gtmContainers: result.gtmIds ? result.gtmIds.length : 0,
            gtmIds: result.gtmIds || [],
            ga4Ids: result.ga4Ids || [],
            consentMode: result.consentMode ? {
              detected: result.consentMode.detected,
              version: result.consentMode.version,
              tool: result.consentMode.tool
            } : null,
            trackingType: result.trackingType,
            gtmLoadedInitially: result.gtmLoadedInitially,
            gaCookielessHits: result.gaCookielessHits,
            networkRequests: result.networkRequests,
            summary: result.summary,
            consentToolStates: result.consentToolStates
          },
          googleSheets: {
            enabled: config.googleSheets.enabled,
            success: sheetsSuccess,
            error: sheetsError
          },
          error: result.error
        };

        results.push(resultData);
        
      } catch (error) {
        console.error(`❌ Error analyzing ${url}:`, error.message);
        results.push({
          website: url,
          error: error.message,
          analysis: null,
          googleSheets: {
            enabled: config.googleSheets.enabled,
            success: false,
            error: error.message
          }
        });
      }
    }

    await browser.close();

    const responseData = {
      success: true,
      totalUrls: urls.length,
      processedUrls: urlsToProcess.length,
      results: results,
      googleSheets: {
        enabled: config.googleSheets.enabled,
        totalSuccess: totalSheetsSuccess,
        totalErrors: totalSheetsErrors,
        summary: `${totalSheetsSuccess}/${urlsToProcess.length} results added to Google Sheets`
      }
    };

    res.json(responseData);

  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: 'Failed to analyze websites: ' + error.message });
  }
});

// Export for Vercel
module.exports = app;

// Start server locally
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 GTM Tracking Analysis Web UI running on http://localhost:${PORT}`);
    console.log(`📊 Open your browser and navigate to the URL above to start analyzing websites!`);
  });
}
