const express = require('express');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');
const { google } = require('googleapis');

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
  if (!config.googleSheets || !config.googleSheets.enabled) return null;
  if (cachedSheetsClient) return cachedSheetsClient;

  let auth;
  if (process.env.GOOGLE_SHEETS_CREDENTIALS) {
    // 1) Vercel env var (base64 JSON)
    const credentials = JSON.parse(Buffer.from(process.env.GOOGLE_SHEETS_CREDENTIALS, 'base64').toString());
    auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  } else if (config.googleSheets.credentialsBase64) {
    // 2) Repo-configured base64 JSON (committed in code) – NOT SECURE but user requested
    const credentials = JSON.parse(Buffer.from(String(config.googleSheets.credentialsBase64), 'base64').toString());
    auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  } else if (config.googleSheets.credentials && typeof config.googleSheets.credentials === 'object') {
    // 3) Inline JSON object in config
    auth = new google.auth.GoogleAuth({ credentials: config.googleSheets.credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  } else {
    // 4) Fallback to file path in repo (for local dev)
    auth = new google.auth.GoogleAuth({ keyFile: config.googleSheets.credentialsFile, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
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

// Analysis function using HTTP requests (no browser needed!)
async function analyzeWebsite(website) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔍 ANALYZING: ${website}`);
  console.log(`${'='.repeat(80)}`);
  
  try {
    // Fetch the website HTML
    const response = await axios.get(website, {
      timeout: config.analysis.timeout,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    const html = response.data;
    const $ = cheerio.load(html);

    // Helpers
    const knownScriptHosts = [
      'www.googletagmanager.com',
      'www.google-analytics.com',
      'google-analytics.com',
      'www.gtagjs.com',
      'consent.cookiebot.com',
      'cdn.cookielaw.org', // OneTrust
      'cdn.cookiebot.com',
    ];
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

    function toAbsoluteUrl(base, maybeRelative) {
      try {
        if (!maybeRelative) return null;
        if (maybeRelative.startsWith('//')) {
          const baseUrl = new URL(base);
          return `${baseUrl.protocol}${maybeRelative}`;
        }
        return new URL(maybeRelative, base).toString();
      } catch (_) {
        return null;
      }
    }

    function extractGa4IdsFrom(text) {
      const ids = new Set();
      if (!text) return ids;
      const regex = /\bG-[A-Z0-9]{6,}\b/g;
      let m;
      while ((m = regex.exec(text)) !== null) {
        ids.add(m[0]);
      }
      return ids;
    }
    
    // Extract GTM IDs from script tags
    const gtmIds = new Set();
    const ga4Ids = new Set();
    const networkRequests = [];
    const summary = { gtm: 0, ga: 0, other: 0 };
    
    // Find GTM scripts
    $('script').each((i, script) => {
      const src = $(script).attr('src') || '';
      const content = $(script).html() || '';
      
      // GTM script detection
      if (src.includes('googletagmanager.com/gtm.js')) {
        summary.gtm++;
        networkRequests.push(src);
        
        const gtmMatch = src.match(/id=(GTM-[A-Z0-9]+)/i);
        if (gtmMatch) gtmIds.add(gtmMatch[1]);
      }
      
      // GA4 script detection
      if (src.includes('googletagmanager.com/gtag/js')) {
        summary.ga++;
        networkRequests.push(src);
        
        const ga4Match = src.match(/id=(G-[A-Z0-9]+)/i);
        if (ga4Match) ga4Ids.add(ga4Match[1]);
      }
      
      // Extract IDs from inline scripts
      const gtmMatches = content.match(/GTM-[A-Z0-9]+/g);
      if (gtmMatches) {
        gtmMatches.forEach(id => gtmIds.add(id));
      }
      
      const ga4Matches = content.match(/G-[A-Z0-9]+/g);
      if (ga4Matches) {
        ga4Matches.forEach(id => ga4Ids.add(id));
      }
    });
    
    // Also fetch external scripts for deeper inspection (limited to 10)
    const externalScriptSrcs = [];
    $('script[src]').each((i, el) => {
      const abs = toAbsoluteUrl(website, $(el).attr('src'));
      if (abs) externalScriptSrcs.push(abs);
    });

    const externalCandidates = externalScriptSrcs
      .filter(u => {
        try {
          const host = new URL(u).host;
          return knownScriptHosts.some(k => host.includes(k)) || /gtm\.js|gtag\/js/.test(u);
        } catch (_) { return false; }
      })
      .slice(0, 10);

    for (const scriptUrl of externalCandidates) {
      try {
        const { data: js } = await axios.get(scriptUrl, { timeout: 15000, headers: { 'User-Agent': userAgent } });
        // Collect GA4 ids
        const ids = extractGa4IdsFrom(js);
        ids.forEach(id => ga4Ids.add(id));

        // Improve consent tool detection
        if (js.includes('Cookiebot')) consentTool = 'Cookiebot';
        if (js.includes('OneTrust') || js.includes('Optanon')) consentTool = 'OneTrust';

        networkRequests.push(scriptUrl);
        if (scriptUrl.includes('googletagmanager.com')) summary.gtm++; else if (scriptUrl.includes('google-analytics')) summary.ga++; else summary.other++;
      } catch (_) {
        // ignore individual script failures
      }
    }

    // If we found GTM IDs but did not fetch their container, try to fetch container JS
    const gtmIdsArray = Array.from(gtmIds).slice(0, 3);
    for (const id of gtmIdsArray) {
      const containerUrl = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(id)}`;
      try {
        const { data: js } = await axios.get(containerUrl, { timeout: 15000, headers: { 'User-Agent': userAgent } });
        const ids = extractGa4IdsFrom(js);
        ids.forEach(mid => ga4Ids.add(mid));
        networkRequests.push(containerUrl);
        summary.gtm++;
      } catch (_) {
        // ignore fetch errors
      }
    }

    // Find dataLayer in script tags
    let dataLayerFound = false;
    $('script').each((i, script) => {
      const content = $(script).html() || '';
      if (content.includes('dataLayer') || content.includes('gtag')) {
        dataLayerFound = true;
        
        // Extract more GTM/GA4 IDs from dataLayer
        const gtmMatches = content.match(/GTM-[A-Z0-9]+/g);
        if (gtmMatches) {
          gtmMatches.forEach(id => gtmIds.add(id));
        }
        
        const ga4Matches = content.match(/G-[A-Z0-9]+/g);
        if (ga4Matches) {
          ga4Matches.forEach(id => ga4Ids.add(id));
        }
      }
    });
    
    // Detect consent tools
    let consentTool = "Unknown";
    if (html.includes('cookiebot.com')) {
      consentTool = "Cookiebot";
    } else if (html.includes('onetrust.com')) {
      consentTool = "OneTrust";
    } else if (html.includes('trustarc.com')) {
      consentTool = "TrustArc";
    } else if (html.includes('quantcast.mgr')) {
      consentTool = "Quantcast";
    }
    
    // Detect consent mode
    let consentModeDetected = false;
    let consentModeVersion = "Unknown";
    if (html.includes('gcs=G100') || html.includes('gcs=G110')) {
      consentModeDetected = true;
      consentModeVersion = "v2";
    } else if (html.includes('gcs=')) {
      consentModeDetected = true;
      consentModeVersion = "v1";
    }
    
    // Determine tracking type
    let trackingType = "Unknown";
    if (networkRequests.some(url => url.includes('googletagmanager.com/gtm.js'))) {
      trackingType = "GTM (client-side)";
    } else if (networkRequests.some(url => url.includes('googletagmanager.com/gtag/js'))) {
      trackingType = "GA4 gtag.js (client-side)";
    } else if (ga4Ids.size > 0) {
      trackingType = "GA4 (detected in scripts)";
    } else if (gtmIds.size > 0) {
      trackingType = "GTM (detected in scripts)";
    } else {
      trackingType = "No tracking detected";
    }
    
    const gtmLoadedInitially = networkRequests.some(url => url.includes('googletagmanager.com/gtm.js'));
    const gaCookielessHits = false; // Can't detect this without browser
    
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
      consentToolStates: { tool: consentTool, states: {}, rawData: null },
      trackingType,
      gtmLoadedInitially,
      gaCookielessHits,
      networkRequests: networkRequests.length,
      error: null
    };
    
  } catch (error) {
    return {
      website,
      error: error.message,
      summary: null
    };
  }
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
    const results = [];
    let totalSheetsSuccess = 0;
    let totalSheetsErrors = 0;

    // Analyze each website (limit to 5 for HTTP requests - much faster!)
    const urlsToProcess = urls.slice(0, 5);
    
    for (let i = 0; i < urlsToProcess.length; i++) {
      const url = urlsToProcess[i];
      console.log(`\n📊 Processing ${i + 1}/${urlsToProcess.length}: ${url}`);
      
      try {
        const result = await analyzeWebsite(url);
        
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

// Ensure Vercel uses Node 22 runtime for this function
module.exports.config = { runtime: 'nodejs22.x' };

// Start server locally
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 GTM Tracking Analysis Web UI running on http://localhost:${PORT}`);
    console.log(`📊 Open your browser and navigate to the URL above to start analyzing websites!`);
  });
}
