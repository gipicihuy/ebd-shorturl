const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

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
  return req.headers['x-forwarded-for']?.split(',').shift() || 
         req.socket.remoteAddress || 
         'Unknown';
}

// Fungsi Notifikasi Telegram
async function sendTelegramNotification(code, ip, url) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

  const clickTime = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  
  const message = `
*⚡️ PEMBERITAHUAN KLIK TAUTAN*

---------------------------------------------
*🔗 Kode Pendek:* \`${code}\`
*➡️ Tujuan:* [Lihat URL Penuh](${url})
*👁️‍🗨️ IP Klien:* \`${ip}\`
*⏰ Waktu (WIB):* ${clickTime}
---------------------------------------------
`;

  const telegramApiUrl = \`https://api.telegram.org/bot\${TELEGRAM_BOT_TOKEN}/sendMessage\`;

  try {
    await fetch(telegramApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'Markdown' 
      }),
    });
  } catch (error) {
    console.error('Failed to send Telegram notification:', error);
  }
}

// Inisialisasi DB di luar handler utama (tetap async)
initDB().catch(e => console.error('Failed to initialize database (Pre-runtime):', e));

// --- Main Handler for Vercel Serverless Function ---
module.exports = async (req, res) => {
  // 🎯 FIX: Wrapper try/catch TERTINGGI untuk menjamin respons JSON
  try {
    // Pastikan DB sudah terinisialisasi
    if (!db) {
        await initDB();
    }

    const path = req.url.split('?')[0];
    const isShortCodePath = path.match(/^\/([a-zA-Z0-9_-]{3,10})$/);

    // Handle API shorten (POST)
    if (path === '/api/shorten' && req.method === 'POST') {
      try {
        const { long_url, short_code } = req.body;
        let finalShortCode;

        if (!long_url || !isValidUrl(long_url)) {
          return res.json({ success: false, error: 'URL is invalid' });
        }

        // Check custom code
        if (short_code) {
          if (short_code.length < 3 || short_code.length > 10 || !/^[a-zA-Z0-9_-]+$/.test(short_code)) {
            return res.json({ success: false, error: 'Custom code invalid (3-10 chars, alphanumeric, _-)' });
          }
          
          const check = await db.get(
            'SELECT id FROM short_urls WHERE short_code = ?', 
            [short_code]
          );
          
          if (check) {
            return res.json({ success: false, error: `Custom code "${short_code}" is already taken` });
          }
          
          finalShortCode = short_code;
        } else {
          // Generate random unique code
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
        // Error handler internal API
        return res.status(500).json({ success: false, error: 'Server error during shortening process' });
      }
    }

    // Handle API stats (GET)
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
        console.error('Stats error:', error);
        // Error handler internal API
        return res.status(500).json({ success: false, error: 'Server error during stats retrieval' });
      }
    }

    // Handle short code redirect
    if (isShortCodePath) {
      const shortCode = isShortCodePath[1];
      
      try {
        const url = await db.get(
          'SELECT long_url FROM short_urls WHERE short_code = ?', 
          [shortCode]
        );

        if (url) {
          // Increment click count
          await db.run('UPDATE short_urls SET click_count = click_count + 1 WHERE short_code = ?', [shortCode]);
          
          const clientIp = getClientIP(req);

          // Panggil Notifikasi Telegram
          sendTelegramNotification(shortCode, clientIp, url.long_url);

          // Redirect
          res.writeHead(302, { 'Location': url.long_url });
          return res.end();
        } else {
          res.status(404).json({ success: false, error: 'URL not found' });
        }
      } catch (error) {
        console.error('Redirect error:', error);
        // Error handler internal API
        res.status(500).json({ success: false, error: 'Server error during redirection' });
      }
      return;
    }

    // Jika tidak ada path yang cocok
    res.status(404).json({ success: false, error: 'Not Found' });
    
  } catch (globalError) {
    // ⚠️ Handler Global untuk error fatal (seperti kegagalan DB) ⚠️
    console.error('FATAL GLOBAL ERROR in Vercel Handler:', globalError);
    // SELALU kembalikan JSON
    return res.status(500).json({ 
        success: false, 
        error: 'FATAL SERVER ERROR: Failed to process request (Check Vercel logs for DB connection issues).' 
    });
  }
};
