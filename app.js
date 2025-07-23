const { chromium } = require('playwright');

// Array of websites to analyze
const websites = [
  "https://7bet.lt/",
  "https://pegasas.lt/",
  "https://www.topocentras.lt/",
  "https://www.evolvery.com/"

];

async function analyzeWebsite(browser, website) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔍 ANALYZING: ${website}`);
  console.log(`${'='.repeat(80)}`);
  
  // Create context with realistic browser settings to avoid bot detection
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'en-US',
    timezoneId: 'Europe/London',
    extraHTTPHeaders: {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
    }
  });
  
  const page = await context.newPage();
  
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
  
  // Add stealth settings and analytics debugging capabilities
  await page.addInitScript(() => {
    // Override the navigator.webdriver property
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });
    
    // Override the plugins property to add realistic plugins
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });
    
    // Override the languages property
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
    });

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
          // New item pushed to dataLayer
          const newItem = target[value - 1];
          if (newItem) {
            window._analyticsDebugger.dataLayerEvents.push({
              timestamp: Date.now(),
              event: newItem,
              eventName: newItem.event || 'unnamed',
              type: 'dataLayer.push'
            });

            // Detect eCommerce events
            if (newItem.ecommerce || newItem.items || 
                ['purchase', 'add_to_cart', 'remove_from_cart', 'view_item', 'begin_checkout'].includes(newItem.event)) {
              window._analyticsDebugger.ecommerceEvents.push({
                timestamp: Date.now(),
                event: newItem,
                eventName: newItem.event || 'ecommerce_event',
                type: 'ecommerce'
              });
            }

            // Capture custom dimensions (custom_parameter_* or user_properties)
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

      // Capture consent-related calls
      if (args[0] === 'consent') {
        window._analyticsDebugger.consentEvents.push({
          timestamp: Date.now(),
          action: args[1], // 'default' or 'update'
          consent_types: parameters,
          type: 'consent'
        });
      }

      // Capture custom dimensions and metrics from gtag events
      if (args[0] === 'event' || args[0] === 'config') {
        Object.keys(parameters).forEach(key => {
          if (key.startsWith('custom_') || key.startsWith('user_') || 
              key.match(/^custom_parameter_\d+/) || key.match(/^custom_metric_\d+/)) {
            if (key.includes('metric')) {
              window._analyticsDebugger.customMetrics.add(key);
            } else {
              window._analyticsDebugger.customDimensions.add(key);
            }
          }
        });
      }

      if (originalGtag) {
        return originalGtag.apply(this, args);
      }
    };

    // Intercept Google Analytics events
    const originalSendBeacon = navigator.sendBeacon;
    navigator.sendBeacon = function(url, data) {
      if (url.includes('google-analytics.com') || url.includes('googletagmanager.com')) {
        window._analyticsDebugger.events.push({
          timestamp: Date.now(),
          url: url,
          data: data,
          type: 'sendBeacon',
          method: 'beacon'
        });
      }
      return originalSendBeacon.call(this, url, data);
    };

    // Intercept fetch requests
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
      const url = args[0];
      if (typeof url === 'string' && (url.includes('google-analytics.com') || url.includes('collect'))) {
        window._analyticsDebugger.events.push({
          timestamp: Date.now(),
          url: url,
          type: 'fetch',
          method: 'fetch'
        });
      }
      return originalFetch.apply(this, args);
    };
  });

  // Playwright setup
  const networkRequests = [];
  const summary = {
    gtm: 0,
    ga: 0,
    other: 0
  };

  // Sets to store unique IDs
  const gtmIds = new Set();
  const ga4Ids = new Set();
  let pageContent = null;
  let consentToolStates = { tool: 'Unknown', states: {}, rawData: null };

  page.on('request', request => {
    const url = request.url();
    
    // Check for GTM requests
    if (url.includes('googletagmanager.com')) {
      summary.gtm++;
      networkRequests.push(url);
      
      // Extract GTM container ID - try multiple patterns
      const gtmMatch1 = url.match(/[?&]id=(GTM-[A-Z0-9]+)/i);
      const gtmMatch2 = url.match(/\/gtm\.js\?id=(GTM-[A-Z0-9]+)/i);
      const gtmMatch3 = url.match(/(GTM-[A-Z0-9]+)/g);
      
      if (gtmMatch1) {
        gtmIds.add(gtmMatch1[1]);
        console.log(`📊 Found GTM ID (pattern 1): ${gtmMatch1[1]}`);
      }
      if (gtmMatch2) {
        gtmIds.add(gtmMatch2[1]);
        console.log(`📊 Found GTM ID (pattern 2): ${gtmMatch2[1]}`);
      }
      if (gtmMatch3) {
        gtmMatch3.forEach(id => {
          if (id.startsWith('GTM-')) {
            gtmIds.add(id);
            console.log(`📊 Found GTM ID (pattern 3): ${id}`);
          }
        });
      }
      
      // Extract GA4 ID from GTM requests (gtag.js loads)
      const ga4FromGtmMatch = url.match(/[?&]id=(G-[A-Z0-9]+)/i);
      if (ga4FromGtmMatch) {
        ga4Ids.add(ga4FromGtmMatch[1]);
      }
      
      console.log(`📊 Captured GTM request: ${url}`);
      
      // Debug: Show URL for analysis
      if (url.length > 200) {
        console.log(`   → Truncated: ${url.substring(0, 200)}...`);
      }
    } 
    // Check for standard GA requests
    else if (url.includes('google-analytics.com')) {
      summary.ga++;
      networkRequests.push(url);
      
      // Extract GA4 Measurement ID from analytics requests
      const ga4Match = url.match(/[?&]tid=(G-[A-Z0-9]+)/i);
      if (ga4Match) {
        ga4Ids.add(ga4Match[1]);
      }
      
      console.log(`📈 Captured GA request: ${url}`);
    }
    // Check for custom analytics endpoints (server-side tracking)
    else if (url.includes('/g/collect') || url.includes('analytics.') || url.match(/[?&]tid=(G-[A-Z0-9]+)/)) {
      // This catches custom analytics endpoints like s.evolvery.com, analytics.topocentras.lt, etc.
      const ga4Match = url.match(/[?&]tid=(G-[A-Z0-9]+)/i);
      if (ga4Match) {
        summary.ga++;
        networkRequests.push(url);
        ga4Ids.add(ga4Match[1]);
        console.log(`📈 Captured CUSTOM GA request: ${url}`);
        console.log(`🎯 Found GA4 ID from custom endpoint: ${ga4Match[1]}`);
        
        // Debug: Show URL for analysis
        if (url.length > 200) {
          console.log(`   → Truncated: ${url.substring(0, 200)}...`);
        }
      } else {
        summary.other++;
      }
    }
    else {
      summary.other++;
    }
  });

  try {
    console.log(`🌐 Navigating to ${website}...`);
    
    // Navigate with network monitoring
    const response = await page.goto(website, { 
      waitUntil: 'load', 
      timeout: 120000 // 2 minutes timeout
    });
    
    console.log(`✅ Page loaded (Status: ${response.status()}), waiting for additional requests...`);
    
    // Check if page has basic content
    const title = await page.title();
    console.log(`📄 Page title: ${title}`);
    
    // Wait for any immediate scripts to load
    await page.waitForTimeout(3000);
    
         // Simulate human behavior to trigger tracking
     console.log("🤖 Simulating human interactions...");
     
     // Scroll down to trigger scroll-based tracking
     await page.evaluate(() => {
       window.scrollTo(0, 500);
     });
     await page.waitForTimeout(2000);
     
     // Scroll back up
     await page.evaluate(() => {
       window.scrollTo(0, 0);
     });
     await page.waitForTimeout(2000);
     
     // Move mouse to simulate activity
     await page.mouse.move(100, 100);
     await page.waitForTimeout(1000);
     await page.mouse.move(500, 300);
     await page.waitForTimeout(1000);
     
     // Try to click on any button or link (non-navigation)
     try {
       const buttons = await page.$$('button, .btn, [role="button"]');
       if (buttons.length > 0) {
         await buttons[0].hover();
         await page.waitForTimeout(1000);
       }
     } catch (e) {
       console.log("   No interactive elements found");
     }
     
     // Wait longer to capture more dynamic requests
     console.log("⏳ Waiting for additional tracking requests...");
     await page.waitForTimeout(15000); // 15 seconds
     
           // Also try to detect GTM containers from the page content and dataLayer
      pageContent = await page.content();
      const gtmInlineMatches = pageContent ? pageContent.match(/GTM-[A-Z0-9]+/g) : null;
      if (gtmInlineMatches) {
        gtmInlineMatches.forEach(id => {
          gtmIds.add(id);
          console.log(`📊 Found GTM ID in page content: ${id}`);
        });
      }

      // Check for GTM container IDs in window objects and dataLayer
      try {
        const gtmFromWindow = await page.evaluate(() => {
          const foundIds = new Set();
          
          // Check window.google_tag_manager
          if (window.google_tag_manager) {
            Object.keys(window.google_tag_manager).forEach(key => {
              if (key.match(/GTM-[A-Z0-9]+/)) {
                foundIds.add(key);
              }
            });
          }
          
          // Check dataLayer for GTM container references
          if (window.dataLayer) {
            const dataLayerString = JSON.stringify(window.dataLayer);
            const gtmMatches = dataLayerString.match(/GTM-[A-Z0-9]+/g);
            if (gtmMatches) {
              gtmMatches.forEach(id => foundIds.add(id));
            }
          }
          
          // Check all script tags more thoroughly
          const scripts = document.querySelectorAll('script');
          scripts.forEach(script => {
            const content = script.textContent || script.innerHTML || '';
            const src = script.src || '';
            const combined = content + ' ' + src;
            const matches = combined.match(/GTM-[A-Z0-9]+/g);
            if (matches) {
              matches.forEach(id => foundIds.add(id));
            }
          });
          
          // Check for gtag config calls
          if (window.gtag && window.gtag._getTracker) {
            try {
              const trackerData = window.gtag._getTracker();
              if (trackerData && typeof trackerData === 'string' && trackerData.match(/GTM-[A-Z0-9]+/)) {
                foundIds.add(trackerData);
              }
            } catch (e) {
              // Ignore errors
            }
          }
          
          return Array.from(foundIds);
        });
        
        if (gtmFromWindow.length > 0) {
          gtmFromWindow.forEach(id => {
            gtmIds.add(id);
            console.log(`📊 Found GTM ID in window objects: ${id}`);
          });
        }
      } catch (e) {
        console.log(`⚠️  Could not check window for GTM IDs: ${e.message}`);
      }

      // Special debugging for evolvery.com to see what GTM data is available
      if (website.includes('evolvery.com')) {
        console.log(`🔬 EVOLVERY.COM GTM DEBUGGING:`);
        try {
          const evolveryDebug = await page.evaluate(() => {
            const debug = {
              hasGoogleTagManager: typeof window.google_tag_manager !== 'undefined',
              googleTagManagerKeys: window.google_tag_manager ? Object.keys(window.google_tag_manager) : [],
              hasDataLayer: typeof window.dataLayer !== 'undefined',
              dataLayerLength: window.dataLayer ? window.dataLayer.length : 0,
              gtmScripts: [],
              allGTMReferences: []
            };
            
            // Find all GTM references in the entire document
            const htmlContent = document.documentElement.outerHTML;
            const gtmMatches = htmlContent.match(/GTM-[A-Z0-9]+/g);
            if (gtmMatches) {
              debug.allGTMReferences = [...new Set(gtmMatches)];
            }
            
            // Check script tags specifically
            const scripts = document.querySelectorAll('script');
            scripts.forEach((script, index) => {
              const content = script.textContent || script.innerHTML || '';
              const src = script.src || '';
              if (content.includes('GTM-') || src.includes('gtm') || content.includes('googletagmanager')) {
                debug.gtmScripts.push({
                  index: index,
                  src: src,
                  hasGTMInContent: content.includes('GTM-'),
                  contentPreview: content.substring(0, 200) + (content.length > 200 ? '...' : '')
                });
              }
            });
            
            return debug;
          });
          
          console.log(`  📊 Has google_tag_manager: ${evolveryDebug.hasGoogleTagManager}`);
          if (evolveryDebug.googleTagManagerKeys.length > 0) {
            console.log(`  🔑 GTM Keys: ${evolveryDebug.googleTagManagerKeys.join(', ')}`);
          }
          console.log(`  📋 Has dataLayer: ${evolveryDebug.hasDataLayer} (${evolveryDebug.dataLayerLength} items)`);
          console.log(`  🎯 All GTM references found: ${evolveryDebug.allGTMReferences.join(', ') || 'None'}`);
          console.log(`  📜 GTM-related scripts: ${evolveryDebug.gtmScripts.length}`);
          
          evolveryDebug.gtmScripts.forEach((script, index) => {
            console.log(`    Script ${index + 1}: ${script.src || 'inline'}`);
            if (script.hasGTMInContent) {
              console.log(`      Contains GTM ID in content: ${script.contentPreview}`);
            }
          });
          
        } catch (debugError) {
          console.log(`  ⚠️  Debug error: ${debugError.message}`);
        }
      }
      
      // Extract Analytics Debugger Data
      console.log("🐛 ANALYTICS DEBUGGER REPORT:");
      
      try {
        const debuggerData = await page.evaluate(() => {
          const data = window._analyticsDebugger || {
            events: [],
            dataLayerEvents: [],
            gtagCalls: [],
            consentEvents: [],
            ecommerceEvents: [],
            customDimensions: new Set(),
            customMetrics: new Set()
          };
          
          // Convert Sets to Arrays for JSON serialization
          return {
            ...data,
            customDimensions: Array.from(data.customDimensions || []),
            customMetrics: Array.from(data.customMetrics || [])
          };
        });

        // Display DataLayer Events
        if (debuggerData.dataLayerEvents.length > 0) {
          console.log(`\n📊 DataLayer Events (${debuggerData.dataLayerEvents.length}):`);
          debuggerData.dataLayerEvents.forEach((event, index) => {
            const time = new Date(event.timestamp).toLocaleTimeString();
            console.log(`  ${index + 1}. [${time}] ${event.eventName}`);
            
            // Show important event properties
            if (event.event && typeof event.event === 'object') {
              const importantKeys = ['event', 'event_name', 'value', 'currency', 'items', 'page_title', 'page_location'];
              importantKeys.forEach(key => {
                if (event.event[key] !== undefined) {
                  console.log(`     • ${key}: ${JSON.stringify(event.event[key]).substring(0, 100)}`);
                }
              });
            }
          });
        } else {
          console.log(`\n📊 DataLayer Events: None captured`);
        }

        // Display gtag() Function Calls
        if (debuggerData.gtagCalls.length > 0) {
          console.log(`\n🎯 gtag() Calls (${debuggerData.gtagCalls.length}):`);
          debuggerData.gtagCalls.forEach((call, index) => {
            const time = new Date(call.timestamp).toLocaleTimeString();
            console.log(`  ${index + 1}. [${time}] gtag('${call.command}', '${call.targetId}')`);
            
            // Show parameters for important calls
            if (call.command === 'event' || call.command === 'config' || call.command === 'consent') {
              const params = JSON.stringify(call.parameters).substring(0, 150);
              console.log(`     Parameters: ${params}${JSON.stringify(call.parameters).length > 150 ? '...' : ''}`);
            }
          });
        } else {
          console.log(`\n🎯 gtag() Calls: None captured`);
        }

        // Display Consent Events
        if (debuggerData.consentEvents.length > 0) {
          console.log(`\n🔒 Consent Commands (${debuggerData.consentEvents.length}):`);
          debuggerData.consentEvents.forEach((event, index) => {
            const time = new Date(event.timestamp).toLocaleTimeString();
            console.log(`  ${index + 1}. [${time}] gtag('consent', '${event.action}')`);
            
            Object.entries(event.consent_types).forEach(([type, value]) => {
              const icon = value === 'granted' ? '✅' : value === 'denied' ? '❌' : '⚠️';
              console.log(`     ${icon} ${type}: ${value}`);
            });
          });
        } else {
          console.log(`\n🔒 Consent Commands: None captured`);
        }

        // Display Analytics Events (sendBeacon/fetch)
        if (debuggerData.events.length > 0) {
          console.log(`\n📈 Analytics Events (${debuggerData.events.length}):`);
          debuggerData.events.slice(0, 5).forEach((event, index) => {
            const time = new Date(event.timestamp).toLocaleTimeString();
            const urlParts = new URL(event.url);
            console.log(`  ${index + 1}. [${time}] ${event.method} → ${urlParts.hostname}`);
            
            // Parse URL parameters for insights
            const params = urlParts.searchParams;
            if (params.get('tid')) console.log(`     🎯 Measurement ID: ${params.get('tid')}`);
            if (params.get('en')) console.log(`     📝 Event Name: ${params.get('en')}`);
            if (params.get('dt')) console.log(`     📄 Page Title: ${params.get('dt')}`);
            if (params.get('gcs')) console.log(`     🍪 Consent State: ${params.get('gcs')}`);
          });
          
          if (debuggerData.events.length > 5) {
            console.log(`     ... and ${debuggerData.events.length - 5} more events`);
          }
        } else {
          console.log(`\n📈 Analytics Events: None captured`);
        }

        // Display eCommerce Events
        if (debuggerData.ecommerceEvents.length > 0) {
          console.log(`\n🛒 eCommerce Events (${debuggerData.ecommerceEvents.length}):`);
          debuggerData.ecommerceEvents.forEach((event, index) => {
            const time = new Date(event.timestamp).toLocaleTimeString();
            console.log(`  ${index + 1}. [${time}] ${event.eventName}`);
            
            // Show eCommerce details
            if (event.event.value) console.log(`     💰 Value: ${event.event.value} ${event.event.currency || ''}`);
            if (event.event.transaction_id) console.log(`     🆔 Transaction ID: ${event.event.transaction_id}`);
            if (event.event.items && event.event.items.length) {
              console.log(`     📦 Items: ${event.event.items.length} items`);
              event.event.items.slice(0, 2).forEach((item, i) => {
                console.log(`       ${i + 1}. ${item.item_name || item.name || 'Unknown'} (${item.quantity || 1}x)`);
              });
            }
          });
        } else {
          console.log(`\n🛒 eCommerce Events: None captured`);
        }

        // Display Custom Dimensions & Metrics
        const customDims = Array.from(debuggerData.customDimensions || []);
        const customMets = Array.from(debuggerData.customMetrics || []);
        
        if (customDims.length > 0 || customMets.length > 0) {
          console.log(`\n🎛️  Custom Tracking:`);
          if (customDims.length > 0) {
            console.log(`  📊 Custom Dimensions (${customDims.length}): ${customDims.join(', ')}`);
          }
          if (customMets.length > 0) {
            console.log(`  📈 Custom Metrics (${customMets.length}): ${customMets.join(', ')}`);
          }
        } else {
          console.log(`\n🎛️  Custom Tracking: None detected`);
        }

      } catch (e) {
        console.log(`⚠️  Could not extract analytics debugger data: ${e.message}`);
      }

      // Additional GTM/GA4 detection methods
      console.log("\n🔍 Performing additional detection checks...");
      
      // Check for GTM/GA4 in window objects
      try {
        const windowObjects = await page.evaluate(() => {
          const result = {
            hasGtag: typeof window.gtag !== 'undefined',
            hasGa: typeof window.ga !== 'undefined',
            hasGoogleTagManager: typeof window.google_tag_manager !== 'undefined',
            hasDataLayer: typeof window.dataLayer !== 'undefined',
            dataLayerLength: window.dataLayer ? window.dataLayer.length : 0,
            scripts: []
          };
          
          // Check all script tags for GTM/GA4 references
          const scripts = document.querySelectorAll('script');
          scripts.forEach(script => {
            const src = script.src || '';
            const content = script.textContent || '';
            if (src.includes('googletagmanager.com') || 
                src.includes('google-analytics.com') || 
                content.includes('GTM-') || 
                content.includes('G-') ||
                content.includes('gtag') ||
                content.includes('dataLayer')) {
              result.scripts.push({
                src: src,
                hasGTM: content.includes('GTM-') || src.includes('gtm'),
                hasGA4: content.includes('G-') || src.includes('gtag'),
                contentLength: content.length
              });
            }
          });
          
          return result;
        });
        
        console.log(`📊 Window object analysis:`);
        console.log(`  • gtag function: ${windowObjects.hasGtag ? '✅' : '❌'}`);
        console.log(`  • ga function: ${windowObjects.hasGa ? '✅' : '❌'}`);
        console.log(`  • google_tag_manager: ${windowObjects.hasGoogleTagManager ? '✅' : '❌'}`);
        console.log(`  • dataLayer: ${windowObjects.hasDataLayer ? '✅' : '❌'} (${windowObjects.dataLayerLength} items)`);
        console.log(`  • Relevant scripts found: ${windowObjects.scripts.length}`);
        
        if (windowObjects.scripts.length > 0) {
          windowObjects.scripts.forEach((script, index) => {
            console.log(`    Script ${index + 1}: ${script.src || 'inline'} (GTM:${script.hasGTM ? '✅' : '❌'} GA4:${script.hasGA4 ? '✅' : '❌'})`);
          });
        }
      } catch (e) {
        console.log(`⚠️  Could not analyze window objects: ${e.message}`);
      }

      // Check for dataLayer and GTM events
      try {
        const dataLayerInfo = await page.evaluate(() => {
          if (typeof window.dataLayer !== 'undefined') {
            const gtmEvents = window.dataLayer.filter(item => 
              item && typeof item === 'object' && 
              (item['gtm.uniqueEventId'] || item.event)
            );
            
            const gtmIds = [];
            window.dataLayer.forEach(item => {
              if (item && typeof item === 'object') {
                const str = JSON.stringify(item);
                const matches = str.match(/GTM-[A-Z0-9]+/g);
                if (matches) {
                  matches.forEach(id => {
                    if (!gtmIds.includes(id)) gtmIds.push(id);
                  });
                }
              }
            });
            
            return {
              hasDataLayer: true,
              eventCount: gtmEvents.length,
              gtmIds: gtmIds,
              events: gtmEvents.slice(-5).map(e => e.event || 'unnamed').filter(Boolean)
            };
          }
          return { hasDataLayer: false };
        });
        
        if (dataLayerInfo.hasDataLayer) {
          console.log(`📊 DataLayer detected with ${dataLayerInfo.eventCount} GTM events`);
          if (dataLayerInfo.events.length > 0) {
            console.log(`📊 Recent events: ${dataLayerInfo.events.join(', ')}`);
          }
          if (dataLayerInfo.gtmIds.length > 0) {
            dataLayerInfo.gtmIds.forEach(id => {
              gtmIds.add(id);
              console.log(`📊 Found GTM ID in dataLayer: ${id}`);
            });
          }
        }
      } catch (e) {
        console.log(`⚠️  Could not check dataLayer: ${e.message}`);
      }

      // Check consent tool's actual consent states
      try {
        consentToolStates = await page.evaluate(() => {
        const result = {
          tool: 'Unknown',
          states: {},
          rawData: null
        };

        // Cookiebot detection
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
            result.rawData = {
              hasResponse: window.Cookiebot.hasResponse || false,
              consentID: window.Cookiebot.consentID || 'unknown'
            };
          } catch (e) {
            result.states = { error: e.message };
          }
        }
        
        // OneTrust detection
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
            result.rawData = {
              activeGroups: activeGroups,
              consentSdk: typeof window.OneTrust !== 'undefined'
            };
          } catch (e) {
            result.states = { error: e.message };
          }
        }
        
        // Check localStorage for consent data
        else {
          try {
            const keys = Object.keys(localStorage);
            const consentKeys = keys.filter(key => 
              key.toLowerCase().includes('consent') || 
              key.toLowerCase().includes('cookie') ||
              key.toLowerCase().includes('gdpr')
            );
            
            if (consentKeys.length > 0) {
              result.tool = 'LocalStorage';
              result.rawData = {};
              consentKeys.forEach(key => {
                try {
                  const value = localStorage.getItem(key);
                  result.rawData[key] = value;
                } catch (e) {
                  result.rawData[key] = 'Could not read';
                }
              });
            }
          } catch (e) {
            result.states = { localStorage_error: e.message };
          }
        }

        return result;
      });

      console.log(`\n🛡️  CONSENT TOOL ANALYSIS:`);
      console.log(`Tool detected: ${consentToolStates.tool}`);
      
      if (Object.keys(consentToolStates.states).length > 0) {
        console.log(`\n🔒 Consent Categories Status:`);
        for (const [category, status] of Object.entries(consentToolStates.states)) {
          const icon = status === true ? '✅' : status === false ? '❌' : '⚠️';
          console.log(`  ${icon} ${category}: ${status}`);
        }
      }
      
      if (consentToolStates.rawData) {
        console.log(`\n📋 Additional Info:`);
                 for (const [key, value] of Object.entries(consentToolStates.rawData)) {
           console.log(`  • ${key}: ${value}`);
         }
       }
      } catch (consentError) {
        console.log(`⚠️  Could not check consent tool states: ${consentError.message}`);
      }
     
    } catch (error) {
    console.log(`❌ Error loading ${website}: ${error.message}`);
    await context.close();
    return {
      website,
      error: error.message,
      summary: null
    };
  }

  // Check GTM immediate load
  const gtmLoadedInitially = networkRequests.some(url => url.includes('googletagmanager.com/gtm.js'));
  console.log(`\n🏷️  GTM loaded initially: ${gtmLoadedInitially ? '✅ Yes' : '❌ No'}`);

  // Check GA cookieless hits
  const gaCookielessHits = networkRequests.some(url => url.includes('google-analytics.com') && url.includes('gcs=G100'));
  console.log(`🍪 GA cookieless hits found: ${gaCookielessHits ? '✅ Yes' : '❌ No'}`);

  if (!gtmLoadedInitially) {
    console.log("⚠️  Issue 1: GTM not loaded immediately (missed analytics opportunities).");
  }
  if (!gaCookielessHits) {
    console.log("⚠️  Issue 2: Cookieless GA Consent Mode v2 hits missing (data lost before consent).");
  }

  // Consent Mode detection
  let consentModeDetected = false;
  let consentModeVersion = "Unknown";
  let consentTool = "Unknown";

  // Check for Consent Mode parameters in requests
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

  // Try to detect common consent tools by script URLs
  if (!pageContent) pageContent = await page.content();
  
  if (pageContent && pageContent.includes('cookiebot.com')) {
    consentTool = "Cookiebot";
  } else if (pageContent && pageContent.includes('onetrust.com')) {
    consentTool = "OneTrust";
  } else if (pageContent && pageContent.includes('trustarc.com')) {
    consentTool = "TrustArc";
  } else if (pageContent && pageContent.includes('quantcast.mgr')) {
    consentTool = "Quantcast";
  }

  // Try to extract and print default consent states from gcd parameter
  const consentStates = {};
  const consentTypes = [
    "ad_storage",
    "analytics_storage",
    "functionality_storage",
    "personalization_storage",
    "security_storage"
  ];

  const gcdRegex = /[?&]gcd=([^&]+)/;
  for (const url of networkRequests) {
    const match = url.match(gcdRegex);
    if (match) {
      const gcd = match[1];
      // Example: gcd=13p3p3p2p5l1
      // Skip the first two chars (version info)
      let idx = 2;
      for (let i = 0; i < consentTypes.length && idx + 1 < gcd.length; i++, idx += 2) {
        const code = gcd.substring(idx, idx + 2);
        let state = "unknown";
        if (code === "p3") state = "granted";
        else if (code === "p2") state = "denied";
        else if (code === "l1") state = "not set";
        consentStates[consentTypes[i]] = state;
      }
      break; // Only need the first found
    }
  }

  // Heuristic: Check tracking implementation type
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

  // Print summary for this website
  console.log(`\n📋 SUMMARY FOR ${website}:`);
  console.log(`GTM requests: ${summary.gtm}`);
  console.log(`GA requests: ${summary.ga}`);
  console.log(`Other requests: ${summary.other}`);

  console.log(`\n🏷️  Unique GTM container IDs found:`);
  if (gtmIds.size === 0) {
    console.log("None");
  } else {
    for (const id of gtmIds) {
      console.log(`- ${id}`);
    }
  }

  console.log(`\n📊 Unique GA4 Measurement IDs found:`);
  if (ga4Ids.size === 0) {
    console.log("None");
  } else {
    for (const id of ga4Ids) {
      console.log(`- ${id}`);
    }
  }

  console.log(`\n🍪 Consent Mode detection:`);
  if (consentModeDetected) {
    console.log(`Consent Mode detected: ✅ Yes`);
    console.log(`Consent Mode version: ${consentModeVersion}`);
  } else {
    console.log("Consent Mode detected: ❌ No");
  }
  console.log(`Consent Tool detected: ${consentTool}`);

  if (Object.keys(consentStates).length > 0) {
    console.log(`\n🔒 Default Consent States:`);
    for (const [type, state] of Object.entries(consentStates)) {
      const icon = state === 'granted' ? '✅' : state === 'denied' ? '❌' : '⚠️';
      console.log(`  ${icon} ${type}: ${state}`);
    }
  } else {
    console.log(`\n🔒 Default Consent States: Not detected`);
  }

        console.log(`\n🔍 Tracking implementation detection:`);
      console.log(`Tracking type: ${trackingType}`);

      // Additional analysis for GA4 loaded but not sending data
      if (ga4Ids.size > 0 && summary.ga === 0) {
        console.log(`\n⚠️  IMPORTANT FINDING:`);
        console.log(`GA4 tracking code detected (${Array.from(ga4Ids).join(', ')}) but NO data collection requests found.`);
        console.log(`This indicates:`);
        console.log(`  • GA4 script is loaded but consent tool is blocking data collection`);
        console.log(`  • No Consent Mode implementation (complete blocking approach)`);
        console.log(`  • Analytics data collection starts only after user consent`);
      }

      // Report any errors that might explain missing tracking
      if (consoleErrors.length > 0) {
        console.log(`\n🚨 Console Errors Found (${consoleErrors.length}):`);
        consoleErrors.slice(0, 3).forEach((error, index) => {
          console.log(`  ${index + 1}. ${error.substring(0, 100)}${error.length > 100 ? '...' : ''}`);
        });
        if (consoleErrors.length > 3) {
          console.log(`  ... and ${consoleErrors.length - 3} more errors`);
        }
      }

      if (failedRequests.length > 0) {
        console.log(`\n🚫 Failed Requests (${failedRequests.length}):`);
        const relevantFailed = failedRequests.filter(req => 
          req.url.includes('googletagmanager.com') || 
          req.url.includes('google-analytics.com') ||
          req.url.includes('gtag') ||
          req.url.includes('gtm')
        );
        if (relevantFailed.length > 0) {
          relevantFailed.forEach((req, index) => {
            console.log(`  ${index + 1}. ${req.url} (${req.failure})`);
          });
        } else {
          console.log(`  No GTM/GA4 related failures found`);
        }
      }

  await context.close();

  return {
    website,
    summary,
    gtmIds: Array.from(gtmIds),
    ga4Ids: Array.from(ga4Ids),
    consentMode: {
      detected: consentModeDetected,
      version: consentModeVersion,
      tool: consentTool,
      states: consentStates
    },
    consentToolStates: consentToolStates,
    trackingType,
    gtmLoadedInitially,
    gaCookielessHits,
    networkRequests: networkRequests.length,
    error: null
  };
}

(async () => {
  console.log("🚀 Starting Multi-Website GTM Analysis...");
  console.log(`📝 Analyzing ${websites.length} websites`);
  
  const browser = await chromium.launch({
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
      '--disable-renderer-backgrounding'
    ]
  });
  const results = [];

  for (const website of websites) {
    const result = await analyzeWebsite(browser, website);
    results.push(result);
  }

  await browser.close();

  // Print comparative summary
  console.log(`\n\n${'🏆'.repeat(2)} COMPARATIVE ANALYSIS ${'🏆'.repeat(2)}`);
  console.log(`\n📊 RESULTS SUMMARY:`);
  
  results.forEach((result, index) => {
    console.log(`\n${index + 1}. ${result.website}`);
    if (result.error) {
      console.log(`   ❌ Error: ${result.error}`);
    } else {
      console.log(`   🏷️  GTM Containers: ${result.gtmIds.length} (${result.gtmIds.join(', ') || 'None'})`);
      console.log(`   📊 GA4 IDs: ${result.ga4Ids.length} (${result.ga4Ids.join(', ') || 'None'})`);
             console.log(`   🍪 Consent Mode: ${result.consentMode.detected ? '✅ ' + result.consentMode.version : '❌ Not detected'}`);
       console.log(`   🛡️  Consent Tool: ${result.consentMode.tool}`);
       
       // Show consent tool states if available
       if (result.consentToolStates && Object.keys(result.consentToolStates.states).length > 0) {
         const states = Object.entries(result.consentToolStates.states)
           .map(([key, value]) => `${key}:${value === true ? '✅' : value === false ? '❌' : '⚠️'}`)
           .join(' ');
         console.log(`   🔒 Consent States: ${states}`);
       }
       
       console.log(`   📈 Tracking Type: ${result.trackingType}`);
       console.log(`   🚀 GTM Immediate Load: ${result.gtmLoadedInitially ? '✅' : '❌'}`);
       console.log(`   🍪 Cookieless Hits: ${result.gaCookielessHits ? '✅' : '❌'}`);
       console.log(`   🌐 Network Requests: ${result.networkRequests}`);
    }
  });

  console.log(`\n✅ Analysis completed for all ${websites.length} websites!`);
})();
