<?php
// SQLite database
$database_file = __DIR__ . '/../urls.db';
$pdo = new PDO("sqlite:" . $database_file);
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$short_code = $_GET['code'] ?? '';

if(!empty($short_code)) {
    $stmt = $pdo->prepare("SELECT long_url FROM short_urls WHERE short_code = ?");
    $stmt->execute([$short_code]);
    $url = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if($url && !empty($url['long_url'])) {
        // Update counter
        $stmt = $pdo->prepare("UPDATE short_urls SET click_count = click_count + 1 WHERE short_code = ?");
        $stmt->execute([$short_code]);
        
        // Redirect
        header("Location: " . $url['long_url']);
        exit;
    }
}

// Not found
http_response_code(404);
echo "URL not found";
?>
