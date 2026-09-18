<?php
// Pengunduh skrip dari Update Center.
// Server statis tidak menyajikan berkas .sh (404), jadi skrip diunduh lewat berkas PHP ini.
// Hanya berkas dalam daftar putih berikut yang boleh diunduh (mencegah path traversal).
$ALLOW = [
    'update-pos-pi.sh',
    'update-pi.sh',
    'check-integrity-pi.sh',
    'collect-metrics-pi.sh',
    'check-workers-pi.sh',
    'bootstrap-pi.sh',
    'backup-pi.sh',
    'backup-to-pos.sh',
    'restore-pi.sh',
    'setup-autobackup-pi.sh',
];
$f = isset($_GET['f']) ? basename((string) $_GET['f']) : '';
$path = __DIR__ . '/' . $f;
if ($f === '' || !in_array($f, $ALLOW, true) || !is_file($path)) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo "Berkas tidak ditemukan. Yang tersedia: " . implode(', ', $ALLOW);
    exit;
}
header('Content-Type: text/plain; charset=utf-8');
header('Content-Disposition: attachment; filename="' . $f . '"');
header('Content-Length: ' . filesize($path));
readfile($path);
