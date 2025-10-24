const express = require('express');
const axios = require('axios'); // Untuk Gist API dan Telegram
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// 🔔 ENVIRONMENT VARIABLES DARI VERCEL
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GIST_ID = process.env.GIST_ID;
const APP_DOMAIN = process.env.APP_DOMAIN || 'https://ebd.biz.id'; // Domain Anda
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Klien Axios untuk interaksi dengan GitHub API
const githubApi = axios.create({
  baseURL: 'https://api.github.com',
  headers: { 
    'Authorization': `token ${GITHUB_TOKEN}`, 
    'Accept': 'application/vnd.github.v3+json' 
  },
});

// --- FUNGSI UTILITAS ---

function generateRandomCode(length = 6) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function isValidUrl(string) {
  try { new URL(string); return true; } catch (_) { return false; }
}

function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',').shift() || req.socket.remoteAddress || 'Unknown';
}

// FUNGSI NOTIFIKASI TELEGRAM
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
  const telegramApiUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    await axios.post(telegramApiUrl, {
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'Markdown' 
    });
  } catch (error) {
    console.error('Failed to send Telegram notification:', error.response ? error.response.data : error.message);
  }
}


// --- MAIN HANDLER ---
module.exports = async (req, res) => {
    // 🎯 FIX: Wrapper try/catch TERTINGGI untuk jaminan respons JSON
    try {
        const pathUrl = req.url.split('?')[0];
        const shortCodeMatch = pathUrl.match(/^\/([a-zA-Z0-9_-]{3,10})$/);

        // ----------------------------------------
        // 1. Handle API shorten (POST /api/shorten)
        // ----------------------------------------
        if (pathUrl === '/api/shorten' && req.method === 'POST') {
            const { longUrl: long_url_body, customCode: short_code_body } = req.body;

            if (!long_url_body || !isValidUrl(long_url_body)) {
                return res.status(400).json({ success: false, error: 'URL is invalid' });
            }

            try {
                // Ambil Gist saat ini
                const { data: gist } = await githubApi.get(`/gists/${GIST_ID}`);
                const gistFile = Object.values(gist.files)[0];
                let links = JSON.parse(gistFile.content || '{}');
                let shortCode = short_code_body;

                if (!shortCode) {
                    do { shortCode = generateRandomCode(); } while (links[shortCode]);
                } else if (links[shortCode]) {
                    return res.status(400).json({ success: false, error: 'Custom code already in use.' });
                }

                // Tambahkan data baru ke Gist
                links[shortCode] = {
                    url: long_url_body,
                    created_at: new Date().toISOString(),
                    clicks: 0 
                    // Struktur data di Gist diubah agar dapat menyimpan click_count
                }; 

                // Perbarui Gist
                await githubApi.patch(`/gists/${GIST_ID}`, {
                    files: { [gistFile.filename]: { content: JSON.stringify(links, null, 2) } },
                });

                return res.json({
                    success: true,
                    short_code: shortCode,
                    short_url: `${APP_DOMAIN}/${shortCode}`
                });

            } catch (error) {
                console.error('Shorten error (Gist API failed):', error.response ? error.response.data : error.message);
                return res.status(500).json({ success: false, error: 'Failed to communicate with Gist API.' });
            }
        }

        // ----------------------------------------
        // 2. Handle short code redirect (/:code)
        // ----------------------------------------
        if (shortCodeMatch) {
            const shortCode = shortCodeMatch[1];
            
            try {
                // Ambil Gist saat ini
                const { data: gist } = await githubApi.get(`/gists/${GIST_ID}`);
                const gistFile = Object.values(gist.files)[0];
                let links = JSON.parse(gistFile.content || '{}');
                const linkData = links[shortCode];

                if (linkData && linkData.url) {
                    const longUrl = linkData.url;
                    
                    // ⚠️ Update Click Count
                    linkData.clicks = (linkData.clicks || 0) + 1;
                    
                    // Perbarui Gist (GIST HARUS DIPERBARUI SETIAP KLIK)
                    await githubApi.patch(`/gists/${GIST_ID}`, {
                        files: { [gistFile.filename]: { content: JSON.stringify(links, null, 2) } },
                    });
                    
                    // Panggil Notifikasi Telegram
                    sendTelegramNotification(shortCode, getClientIP(req), longUrl);

                    // Redirect
                    res.writeHead(302, { 'Location': longUrl });
                    return res.end();
                } else {
                    return res.status(404).json({ success: false, error: 'URL not found' });
                }
            } catch (error) {
                console.error('Redirect error (Gist API failed):', error.response ? error.response.data : error.message);
                // Jika Gist gagal fetch, kita masih harus mengembalikan JSON
                return res.status(500).json({ success: false, error: 'Server error during redirection.' });
            }
        }
        
        // ----------------------------------------
        // 3. Handle API stats (GET /api/stats)
        // ----------------------------------------
        if (pathUrl === '/api/stats' && req.method === 'GET') {
            const code = req.query.code;
            
            if (!code) {
              return res.status(400).json({ success: false, error: 'Code parameter required' });
            }

            try {
                const { data: gist } = await githubApi.get(`/gists/${GIST_ID}`);
                const gistFile = Object.values(gist.files)[0];
                const links = JSON.parse(gistFile.content || '{}');
                const stats = links[code];

                if (stats && stats.url) {
                    return res.json({ 
                        success: true, 
                        stats: {
                            short_code: code,
                            click_count: stats.clicks || 0,
                            created_at: stats.created_at || 'N/A'
                        } 
                    });
                } else {
                    return res.json({ success: false, error: 'Short code not found' });
                }
            } catch (error) {
                console.error('Stats error (Gist API failed):', error.response ? error.response.data : error.message);
                return res.status(500).json({ success: false, error: 'Server error during stats retrieval.' });
            }
        }

        // Default route (diasumsikan Vercel routing /public/index.html)
        return res.status(404).json({ success: false, error: 'Not Found' });
        
    } catch (globalError) {
        console.error('FATAL GLOBAL ERROR in Vercel Handler:', globalError);
        return res.status(500).json({ 
            success: false, 
            error: 'FATAL SERVER ERROR: Unhandled exception.' 
        });
    }
};
