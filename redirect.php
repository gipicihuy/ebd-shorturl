<?php
include 'config.php';

// Ambil short code dari URL
$path = $_SERVER['REQUEST_URI'];
$short_code = ltrim($path, '/');

if (!empty($short_code)) {
    // Cari URL asli di database
    $stmt = $pdo->prepare("SELECT long_url FROM short_urls WHERE short_code = ?");
    $stmt->execute([$short_code]);
    $url = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if ($url && !empty($url['long_url'])) {
        // Update counter
        $stmt = $pdo->prepare("UPDATE short_urls SET click_count = click_count + 1 WHERE short_code = ?");
        $stmt->execute([$short_code]);
        
        // Redirect ke URL asli
        header("Location: " . $url['long_url']);
        exit;
    }
}

// Jika tidak ditemukan
http_response_code(404);
?>
<!DOCTYPE html>
<html>
<head>
    <title>URL Tidak Ditemukan - EBD</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css" rel="stylesheet">
</head>
<body>
    <div class="container mt-5 text-center">
        <h1>❌ URL Tidak Ditemukan</h1>
        <p>Short URL <strong>ebd.biz.id/<?= htmlspecialchars($short_code) ?></strong> tidak ada.</p>
        <a href="/" class="btn btn-primary">Buat URL Pendek Baru</a>
    </div>
</body>
</html>
<?php exit; ?>
