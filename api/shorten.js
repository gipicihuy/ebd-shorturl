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

// Generate short code (random)
function generateShortCode(length = 6) {
  const characters = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += characters[Math.floor(Math.random() * characters.length)];
  }
  return code;
}

// Validate URL
function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

// Handle ALL requests
app.all('*', async (req, res) => {
  await initDB(); // Initialize DB on each request
  
  const path = req.path;
  
  // Handle redirect for short codes (any 3-10 character code)
  if (path.length >= 4 && path.length <= 12 && path.startsWith('/')) {
    const short_code = path.slice(1); // Remove leading slash
    
    // Validate format: alphanumeric, underscore, dash only
    if (/^[a-zA-Z0-9_-]{3,10}$/.test(short_code)) {
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
        }
      } catch (error) {
        console.error('Redirect error:', error);
      }
    }
  }
  
  // Handle API shorten
  if (path === '/api/shorten' && req.method === 'POST') {
    try {
      const { long_url, short_code } = req.body;
      
      if (!long_url) {
        return res.json({ success: false, error: 'URL is required' });
      }
      
      // Validate URL format
      if (!isValidUrl(long_url)) {
        return res.json({ success: false, error: 'Invalid URL format' });
      }
      
      let finalShortCode;
      
      if (short_code) {
        // Validasi custom short code
        if (typeof short_code !== 'string') {
          return res.json({ success: false, error: 'Short code must be a string' });
        }

        if (short_code.length < 3 || short_code.length > 10) {
          return res.json({ success: false, error: 'Short code must be 3-10 characters' });
        }

        if (!/^[a-zA-Z0-9_-]+$/.test(short_code)) {
          return res.json({ success: false, error: 'Short code can only contain letters, numbers, underscore, and dash' });
        }

        // Cek apakah short code sudah ada
        const existing = await db.get(
          'SELECT id FROM short_urls WHERE short_code = ?', 
          [short_code]
        );
        
        if (existing) {
          return res.json({ success: false, error: 'Short code already taken' });
        }

        finalShortCode = short_code;
      } else {
        // Generate random short code jika tidak disediakan
        let generated;
        let exists;
        
        do {
          generated = generateShortCode();
          const check = await db.get(
            'SELECT id FROM short_urls WHERE short_code = ?', 
            [generated]
          );
          exists = !!check;
        } while (exists);
        
        finalShortCode = generated;
      }
      
      // Save to database
      await db.run(
        'INSERT INTO short_urls (long_url, short_code) VALUES (?, ?)',
        [long_url, finalShortCode]
      );
      
      return res.json({
        success: true,
        short_code: finalShortCode,
        short_url: `https://ebd.biz.id/${finalShortCode}`
      });
      
    } catch (error) {
      console.error('Shorten error:', error);
      return res.json({ success: false, error: 'Server error' });
    }
  }

  // Handle API stats (optional)
  if (path === '/api/stats' && req.method === 'GET') {
    try {
      const code = req.query.code;
      
      if (!code) {
        return res.json({ success: false, error: 'Code parameter required' });
      }

      const stats = await db.get(
        'SELECT short_code, click_count, created_at FROM short_urls WHERE short_code = ?',
        [code]
      );

      if (stats) {
        return res.json({ success: true, stats });
      } else {
        return res.json({ success: false, error: 'Short code not found' });
      }
    } catch (error) {
      return res.json({ success: false, error: 'Server error' });
    }
  }
  
  // Default response
  res.status(404).json({ error: 'Not found' });
});

// Export for Vercel
module.exports = app;
