<?php
// Penerima backup database dari server POS (backup-to-pos.sh / tombol di app).
// Menyimpan ke backups/ (maksimal 10 file terbaru, otomatis dipangkas).
header('Content-Type: application/json');

$token = $_SERVER['HTTP_X_GAK_TOKEN'] ?? ($_GET['token'] ?? '');
if (!hash_equals('gak_bkp_2a8d51c4', (string)$token)) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'invalid token']);
    exit;
}

$rl = __DIR__ . '/.last_bkp';
if (file_exists($rl) && time() - (int)file_get_contents($rl) < 10) {
    http_response_code(429);
    echo json_encode(['ok' => false, 'error' => 'rate limited']);
    exit;
}
file_put_contents($rl, time());

$dir = __DIR__ . '/backups';
if (!is_dir($dir)) @mkdir($dir, 0775, true);

$in = fopen('php://input', 'rb');
if (!$in) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'cannot read body']);
    exit;
}

$name = 'backup-' . gmdate('Ymd-His') . '.gz';
$path = $dir . '/' . $name;
$out = fopen($path, 'wb');
if (!$out) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'cannot write']);
    exit;
}

$size = 0;
$MAX = 150 * 1024 * 1024; // 150 MB
while (!feof($in)) {
    $chunk = fread($in, 262144);
    if ($chunk === false) break;
    $size += strlen($chunk);
    if ($size > $MAX) {
        fclose($in); fclose($out); @unlink($path);
        http_response_code(413);
        echo json_encode(['ok' => false, 'error' => 'too large']);
        exit;
    }
    fwrite($out, $chunk);
}
fclose($in); fclose($out);

if ($size === 0) { @unlink($path); http_response_code(400); echo json_encode(['ok'=>false,'error'=>'empty']); exit; }

$files = glob($dir . '/*');
usort($files, function ($a, $b) { return filemtime($b) - filemtime($a); });
foreach (array_slice($files, 10) as $old) @unlink($old);

echo json_encode(['ok' => true, 'file' => $name, 'size' => $size]);
