<?php
include 'config.php';

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['long_url'])) {
    $long_url = $_POST['long_url'];
    
    if (!filter_var($long_url, FILTER_VALIDATE_URL)) {
        $error = "URL tidak valid!";
    } else {
        // Generate short code unik
        do {
            $short_code = generateShortCode();
            $stmt = $pdo->prepare("SELECT id FROM short_urls WHERE short_code = ?");
            $stmt->execute([$short_code]);
        } while ($stmt->fetch());
        
        // Simpan ke database
        $stmt = $pdo->prepare("INSERT INTO short_urls (long_url, short_code) VALUES (?, ?)");
        $stmt->execute([$long_url, $short_code]);
        
        $short_url = "https://ebd.biz.id/" . $short_code;  // PAKE DOMAIN KAMU
        $success = true;
    }
}
?>

<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>EBD URL Shortener</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <style>
        body { background: #f8f9fa; padding: 20px; }
        .card { border: none; border-radius: 15px; margin-top: 50px; }
        .btn-primary { background: #6c63ff; border: none; }
    </style>
</head>
<body>
    <div class="container">
        <div class="row justify-content-center">
            <div class="col-md-6">
                <div class="card shadow">
                    <div class="card-body text-center">
                        <h1>🔗 EBD URL Shortener</h1>
                        <p class="text-muted">ebd.biz.id</p>
                        
                        <form method="POST" class="mt-4">
                            <div class="input-group">
                                <input type="url" name="long_url" class="form-control" 
                                       placeholder="https://example.com/very-long-url" required>
                                <button class="btn btn-primary" type="submit">Shorten</button>
                            </div>
                        </form>

                        <?php if (isset($error)): ?>
                            <div class="alert alert-danger mt-3"><?= htmlspecialchars($error) ?></div>
                        <?php endif; ?>

                        <?php if (isset($success)): ?>
                            <div class="alert alert-success mt-3">
                                <h5>✅ URL Pendek Berhasil!</h5>
                                <div class="input-group mt-2">
                                    <input type="text" id="shortUrl" class="form-control" 
                                           value="<?= htmlspecialchars($short_url) ?>" readonly>
                                    <button class="btn btn-success" onclick="copyToClipboard()">Copy</button>
                                </div>
                                <small class="text-muted mt-2 d-block">
                                    <a href="<?= htmlspecialchars($short_url) ?>" target="_blank">Test URL</a>
                                </small>
                            </div>
                        <?php endif; ?>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
    function copyToClipboard() {
        const copyText = document.getElementById("shortUrl");
        copyText.select();
        navigator.clipboard.writeText(copyText.value);
        alert("URL berhasil disalin!");
    }
    </script>
</body>
</html>
