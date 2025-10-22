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
    filename: './urls.db',
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

// Shorten URL endpoint
app.post('/api/shorten', async (req, res) => {
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
    
    res.json({
      success: true,
      short_code: short_code,
      short_url: `https://ebd.biz.id/${short_code}`
    });
    
  } catch (error) {
    res.json({ success: false, error: 'Server error' });
  }
});

// Redirect endpoint
app.get('/:code', async (req, res) => {
  try {
    const { code } = req.params;
    
    const url = await db.get(
      'SELECT long_url FROM short_urls WHERE short_code = ?',
      [code]
    );
    
    if (url && url.long_url) {
      // Update click count
      await db.run(
        'UPDATE short_urls SET click_count = click_count + 1 WHERE short_code = ?',
        [code]
      );
      
      return res.redirect(url.long_url);
    }
    
    res.status(404).send('URL not found');
    
  } catch (error) {
    res.status(500).send('Server error');
  }
});

// Initialize and start server
initDB().then(() => {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
});
