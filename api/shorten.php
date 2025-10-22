<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');

// SQLite database
$database_file = __DIR__ . '/../urls.db';
$pdo = new PDO("sqlite:" . $database_file);
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

// Create table if not exists
$pdo->exec("CREATE TABLE IF NOT EXISTS short_urls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    long_url TEXT NOT NULL,
    short_code VARCHAR(10) UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    click_count INTEGER DEFAULT 0
)");

$input = json_decode(file_get_contents('php://input'), true);
$long_url = $input['long_url'] ?? '';

if(empty($long_url)) {
    echo json_encode(['success' => false, 'error' => 'URL is required']);
    exit;
}

if(!filter_var($long_url, FILTER_VALIDATE_URL)) {
    echo json_encode(['success' => false, 'error' => 'Invalid URL']);
    exit;
}

// Generate unique short code
function generateShortCode($length = 6) {
    $characters = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    $code = '';
    for ($i = 0; $i < $length; $i++) {
        $code .= $characters[rand(0, strlen($characters) - 1)];
    }
    return $code;
}

$short_code = generateShortCode();

// Ensure unique
do {
    $stmt = $pdo->prepare("SELECT id FROM short_urls WHERE short_code = ?");
    $stmt->execute([$short_code]);
    $exists = $stmt->fetch();
    if($exists) $short_code = generateShortCode();
} while($exists);

// Save to database
try {
    $stmt = $pdo->prepare("INSERT INTO short_urls (long_url, short_code) VALUES (?, ?)");
    $stmt->execute([$long_url, $short_code]);
    
    echo json_encode([
        'success' => true, 
        'short_code' => $short_code,
        'short_url' => "https://ebd.biz.id/" . $short_code
    ]);
} catch(Exception $e) {
    echo json_encode(['success' => false, 'error' => 'Database error']);
}
?>
