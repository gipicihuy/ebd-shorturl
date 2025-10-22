const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Open SQLite database
let db;
async function initDB() {
  db = await open({
    filename: '/tmp/urls.db',  // Use /tmp for Vercel
    driver: sqlite3.Database
  });
  
  await db.exec(`
    CREATE TABLE IF NOT EXISTS short_urls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      long_url TEXT NOT NULL,
      short_code VARCHAR(10) UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      click_count INTEGER DEFAULT 0
    )
  `);
}

// Generate short code
function generateShortCode(length = 6) {
  const characters = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += characters[Math.floor(Math.random() * characters.length)];
  }
  return code;
}

// Handle ALL requests
app.all('*', async (req, res) => {
  await initDB(); // Initialize DB on each request
  
  const path = req.path;
  
  // Handle redirect for short codes
  if (path.length === 7 && path.startsWith('/')) { // /abc123 format
    const short_code = path.slice(1); // Remove leading slash
    
    try {
      const url = await db.get(
        'SELECT long_url FROM short_urls WHERE short_code = ?',
        [short_code]
      );
      
      if (url && url.long_url) {
        // Update click count
        await db.run(
          'UPDATE short_urls SET click_count = click_count + 1 WHERE short_code = ?',
          [short_code]
        );
        
        return res.redirect(302, url.long_url);
      } else {
        return res.status(404).send('URL not found: ' + short_code);
      }
    } catch (error) {
      return res.status(500).send('Server error');
    }
  }
  
  // Handle API shorten
  if (path === '/api/shorten' && req.method === 'POST') {
    try {
      const { long_url } = req.body;
      
      if (!long_url) {
        return res.json({ success: false, error: 'URL is required' });
      }
      
      // Validate URL
      try {
        new URL(long_url);
      } catch (e) {
        return res.json({ success: false, error: 'Invalid URL' });
      }
      
      let short_code;
      let exists;
      
      // Generate unique short code
      do {
        short_code = generateShortCode();
        const existing = await db.get(
          'SELECT id FROM short_urls WHERE short_code = ?', 
          [short_code]
        );
        exists = !!existing;
      } while (exists);
      
      // Save to database
      await db.run(
        'INSERT INTO short_urls (long_url, short_code) VALUES (?, ?)',
        [long_url, short_code]
      );
      
      return res.json({
        success: true,
        short_code: short_code,
        short_url: `https://ebd.biz.id/${short_code}`
      });
      
    } catch (error) {
      return res.json({ success: false, error: 'Server error' });
    }
  }
  
  // Default response
  res.status(404).send('Not found');
});

// Export for Vercel
module.exports = app;
