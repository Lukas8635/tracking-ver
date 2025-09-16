const fs = require('fs');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('🔧 Google Sheets Setup for GTM Analysis Tool');
console.log('============================================\n');

async function setupGoogleSheets() {
  try {
    // Load existing config
    let config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
    
    console.log('📋 Current configuration:');
    console.log(`   Google Sheets enabled: ${config.googleSheets.enabled}`);
    console.log(`   Spreadsheet ID: ${config.googleSheets.spreadsheetId || 'Not set'}`);
    console.log(`   Sheet name: ${config.googleSheets.sheetName}`);
    console.log(`   Credentials file: ${config.googleSheets.credentialsFile}\n`);

    // Ask if user wants to enable Google Sheets
    const enableSheets = await askQuestion('Do you want to enable Google Sheets export? (y/n): ');
    
    if (enableSheets.toLowerCase() === 'y' || enableSheets.toLowerCase() === 'yes') {
      config.googleSheets.enabled = true;
      
      // Get spreadsheet ID
      const spreadsheetId = await askQuestion('Enter your Google Sheets Spreadsheet ID: ');
      config.googleSheets.spreadsheetId = spreadsheetId;
      
      // Get sheet name
      const sheetName = await askQuestion(`Enter sheet name (default: "${config.googleSheets.sheetName}"): `);
      if (sheetName.trim()) {
        config.googleSheets.sheetName = sheetName.trim();
      }
      
      // Check if credentials file exists
      if (!fs.existsSync(config.googleSheets.credentialsFile)) {
        console.log('\n⚠️  Credentials file not found!');
        console.log('📝 To set up Google Sheets integration:');
        console.log('1. Go to Google Cloud Console (https://console.cloud.google.com/)');
        console.log('2. Create a new project or select existing one');
        console.log('3. Enable Google Sheets API');
        console.log('4. Create a Service Account');
        console.log('5. Download the JSON credentials file');
        console.log(`6. Rename it to "${config.googleSheets.credentialsFile}" and place it in this directory`);
        console.log('7. Share your Google Sheet with the service account email (found in the JSON file)');
        
        const hasCredentials = await askQuestion('\nDo you have the credentials file ready? (y/n): ');
        if (hasCredentials.toLowerCase() === 'y' || hasCredentials.toLowerCase() === 'yes') {
          const credentialsFile = await askQuestion(`Enter credentials filename (default: "${config.googleSheets.credentialsFile}"): `);
          if (credentialsFile.trim()) {
            config.googleSheets.credentialsFile = credentialsFile.trim();
          }
        } else {
          console.log('❌ Google Sheets integration disabled. You can enable it later by running this setup again.');
          config.googleSheets.enabled = false;
        }
      } else {
        console.log('✅ Credentials file found!');
      }
    } else {
      config.googleSheets.enabled = false;
    }
    
    // Save updated config
    fs.writeFileSync('./config.json', JSON.stringify(config, null, 2));
    console.log('\n✅ Configuration updated successfully!');
    
    if (config.googleSheets.enabled) {
      console.log('\n📊 Google Sheets integration is now enabled!');
      console.log('   Your analysis results will be automatically exported to:');
      console.log(`   https://docs.google.com/spreadsheets/d/${config.googleSheets.spreadsheetId}`);
    }
    
  } catch (error) {
    console.error('❌ Error setting up Google Sheets:', error.message);
  } finally {
    rl.close();
  }
}

function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

setupGoogleSheets();
