const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Webhook dari environment variable (AMAN!)
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

// Open SQLite database
let db;
async function initDB() {
  db = await open({
    filename: '/tmp/urls.db',
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

// Get client IP
function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() ||
         req.headers['x-real-ip'] ||
         req.connection.remoteAddress ||
         req.socket.remoteAddress ||
         'Unknown';
}

// Send Discord notification
async function sendDiscordNotification(shortCode, longUrl, ip) {
  if (!DISCORD_WEBHOOK_URL) {
    console.log('Discord webhook not configured');
    return;
  }

  try {
    const now = new Date();
    
    // Format tanggal Indonesia
    const tanggal = now.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
    
    // Format jam Indonesia (WIB)
    const jam = now.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: 'Asia/Jakarta'
    });

    const embed = {
      title: '🔗 Link Diklik!',
      color: 0x00ff00,
      fields: [
        {
          name: '📎 Short Code',
          value: `\`${shortCode}\``,
          inline: true
        },
        {
          name: '🌐 IP Address',
          value: `\`${ip}\``,
          inline: true
        },
        {
          name: '📅 Tanggal',
          value: tanggal,
          inline: true
        },
        {
          name: '🕒 Jam (WIB)',
          value: jam,
          inline: true
        },
        {
          name: '🔗 Target URL',
          value: longUrl.length > 100 ? longUrl.substring(0, 97) + '...' : longUrl,
          inline: false
        }
      ],
      footer: {
        text: 'EBD URL Shortener'
      },
      timestamp: now.toISOString()
    };

    await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        embeds: [embed]
      })
    });
  } catch (error) {
    console.error('Discord notification error:', error);
  }
}

// Handle ALL requests
app.all('*', async (req, res) => {
  await initDB();
  
  const path = req.path;
  
  // Handle redirect for short codes
  if (path.length >= 4 && path.length <= 12 && path.startsWith('/')) {
    const short_code = path.slice(1);
    
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
          
          // Get client IP
          const clientIP = getClientIP(req);
          
          // Send Discord notification (async, tidak menunggu)
          sendDiscordNotification(short_code, url.long_url, clientIP);
          
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
      
      if (!isValidUrl(long_url)) {
        return res.json({ success: false, error: 'Invalid URL format' });
      }
      
      let finalShortCode;
      
      if (short_code) {
        if (typeof short_code !== 'string') {
          return res.json({ success: false, error: 'Short code must be a string' });
        }

        if (short_code.length < 3 || short_code.length > 10) {
          return res.json({ success: false, error: 'Short code must be 3-10 characters' });
        }

        if (!/^[a-zA-Z0-9_-]+$/.test(short_code)) {
          return res.json({ success: false, error: 'Short code can only contain letters, numbers, underscore, and dash' });
        }

        const existing = await db.get(
          'SELECT id FROM short_urls WHERE short_code = ?', 
          [short_code]
        );
        
        if (existing) {
          return res.json({ success: false, error: 'Short code already taken' });
        }

        finalShortCode = short_code;
      } else {
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

  // Handle API stats
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
  
  res.status(404).json({ error: 'Not found' });
});

module.exports = app;
