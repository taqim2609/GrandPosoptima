<?php
// Utilitas Update Center — berkas proyek disajikan APA ADANYA dari folder `project/`.
//
// Sengaja TIDAK memakai arsip TAR / kompresi apa pun untuk daftar berkas: folder
// `project/` adalah salinan langsung berkas yang di-track git, jadi:
//   - files.php -> memindai folder itu untuk menampilkan daftar berkas
//   - file.php  -> mengirim satu berkas langsung dari folder itu
// Arsip `pos-grand.tar.gz` tetap ada HANYA sebagai bahan update otomatis server Pi
// (satu berkas untuk diunduh skrip update-pos-pi.sh).

// Cache configuration
// Kunci cache memakai TANDA VERSI RILIS (isi version.json), bukan TTL buta: daftar
// berkas dihitung ulang TEPAT saat ada rilis baru, sementara permintaan berulang
// pada versi yang sama dilayani dari cache. TTL tetap ada hanya sebagai jaring
// pengaman (mis. berkas dihapus manual tanpa memperbarui version.json).
define('GAK_CACHE_DIR', sys_get_temp_dir() . '/gak_cache');
define('GAK_CACHE_TTL', 21600);   // 6 jam (jaring pengaman)
define('GAK_CACHE_KEEP', 12);     // jumlah berkas cache yang disimpan (sisanya dibuang)

// Tanda versi rilis: isi version.json. Berubah setiap rilis baru dibuat, sehingga
// cache lama otomatis tidak terpakai lagi (tanpa perlu ada yang membersihkannya).
function gak_release_signature()
{
    static $sig = null;
    if ($sig !== null) {
        return $sig;
    }
    $vj  = __DIR__ . '/version.json';
    $sig = 'v-none';
    if (is_file($vj)) {
        $raw = (string) @file_get_contents($vj);
        $j   = @json_decode($raw, true);
        if (is_array($j)) {
            $sig = 'v' . (string) (isset($j['version']) ? $j['version'] : '') . '|'
                 . (string) (isset($j['files']) ? $j['files'] : '') . '|'
                 . (string) (isset($j['updated']) ? $j['updated'] : '');
        } else {
            $sig = 'raw-' . md5($raw);
        }
    }
    return $sig;
}

function gak_cache_dir_ensure()
{
    if (!is_dir(GAK_CACHE_DIR)) {
        @mkdir(GAK_CACHE_DIR, 0755, true);
    }
}

function gak_cache_path($key)
{
    gak_cache_dir_ensure();
    return GAK_CACHE_DIR . '/' . md5($key) . '.cache';
}

// Ambil data dari cache; null bila belum ada / sudah kedaluwarsa.
function gak_cache_get($key, $ttl = null)
{
    $ttl  = ($ttl === null) ? GAK_CACHE_TTL : (int) $ttl;
    $path = gak_cache_path($key);
    if (!is_file($path)) {
        return null;
    }
    $mtime = @filemtime($path);
    if ($mtime === false || (time() - $mtime) > $ttl) {
        @unlink($path);
        return null;
    }
    $data = @unserialize((string) @file_get_contents($path));
    return ($data === false) ? null : $data;
}

function gak_cache_set($key, $data)
{
    $path = gak_cache_path($key);
    @file_put_contents($path, serialize($data), LOCK_EX);
    @chmod($path, 0644);
}

// Buang cache terlama bila jumlahnya berlebihan (tiap rilis baru meninggalkan satu
// entri lama yang tidak lagi dirujuk sesiapa).
function gak_cache_prune($keep = GAK_CACHE_KEEP)
{
    $files = @glob(GAK_CACHE_DIR . '/*.cache');
    if (!$files || count($files) <= $keep) {
        return;
    }
    $aged = array();
    foreach ($files as $f) {
        $m = @filemtime($f);
        $aged[$f] = ($m === false) ? 0 : $m;
    }
    arsort($aged);                                    // terbaru di depan
    $drop = array_slice(array_keys($aged), $keep);    // sisanya dibuang
    foreach ($drop as $f) {
        @unlink($f);
    }
}

// Folder salinan berkas proyek.
function gak_project_dir()
{
    return __DIR__ . '/project';
}

// Pemindaian NYATA (tanpa cache) — dipakai oleh cache bundel di bawah.
function gak_scan_dir($dir)
{
    $out = array();
    if (!is_dir($dir)) {
        return $out;
    }
    $it = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::LEAVES_ONLY
    );
    $skip = strlen($dir) + 1;
    foreach ($it as $info) {
        if (!$info->isFile()) {
            continue;                                  // folder / symlink ke folder tidak didaftarkan
        }
        $rel = substr($info->getPathname(), $skip);
        $rel = str_replace(DIRECTORY_SEPARATOR, '/', $rel);
        $out[] = array('name' => $rel, 'size' => (int) $info->getSize());
    }
    return $out;
}

// Bundel cache per VERSI RILIS: sekali hitung berisi daftar apa adanya + daftar terurut.
// Sengaja SATU berkas cache per versi (bukan satu per jenis data) supaya batas jumlah
// berkas cache tepat (GAK_CACHE_KEEP) dan mudah dibersihkan.
function gak_project_bundle($dir = null)
{
    $dir = ($dir === null) ? gak_project_dir() : $dir;
    static $memo = array();                            // dalam satu permintaan: cukup sekali
    if (isset($memo[$dir])) {
        return $memo[$dir];
    }
    $key = 'bundle:' . gak_release_signature() . ':' . md5($dir);
    $hit = gak_cache_get($key);
    if (is_array($hit) && isset($hit['scan']) && isset($hit['list'])) {
        $memo[$dir] = $hit;
        return $hit;
    }
    $scan = gak_scan_dir($dir);
    $list = $scan;
    usort($list, function ($a, $b) {
        return strcasecmp($a['name'], $b['name']);
    });
    $bundle = array('scan' => $scan, 'list' => $list);
    gak_cache_set($key, $bundle);
    gak_cache_prune();
    $memo[$dir] = $bundle;
    return $bundle;
}

// Daftar seluruh berkas di folder project/ (rekursif) — dari cache versi rilis.
// Hasil: [['name' => 'backend/server.py', 'size' => 1234], ...]
function gak_project_scan($dir = null)
{
    $b = gak_project_bundle($dir);
    return $b['scan'];
}

// Daftar berkas TERURUT (abjad, tanpa peduli besar-kecil huruf) — dipakai files.php.
function gak_project_list($dir = null)
{
    $b = gak_project_bundle($dir);
    return $b['list'];
}

// Saring daftar berkas berdasarkan kata kunci (tanpa peduli besar-kecil huruf).
function gak_project_filter($rows, $q)
{
    $q = strtolower(trim((string) $q));
    if ($q === '') {
        return $rows;
    }
    $out = array();
    foreach ($rows as $r) {
        if (strpos(strtolower($r['name']), $q) !== false) {
            $out[] = $r;
        }
    }
    return $out;
}

// Ubah nama relatif (dari query string) jadi path nyata DI DALAM folder project/.
// Mengembalikan null bila nama tidak sah atau berkasnya tidak ada (anti path traversal).
function gak_project_path($rel)
{
    $base = gak_project_dir();
    $rel  = str_replace(array("\0", '\\'), array('', '/'), (string) $rel);
    $rel  = ltrim($rel, '/');
    while (substr($rel, 0, 2) === './') {
        $rel = substr($rel, 2);
    }
    if ($rel === '' || strpos($rel, '..') !== false) {
        return null;
    }
    $path = $base . '/' . $rel;
    if (!is_file($path)) {                             // is_file() menolak folder
        return null;
    }
    $real = realpath($path);
    $root = realpath($base);
    if ($real === false || $root === false) {
        return null;
    }
    if (strpos($real, $root . DIRECTORY_SEPARATOR) !== 0) {
        return null;                                   // ternyata di luar folder project/
    }
    return $real;
}

// Jenis konten berdasarkan ekstensi (untuk header unduhan).
function gak_mime($name)
{
    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    $map = array(
        'php' => 'text/plain; charset=utf-8', 'py' => 'text/plain; charset=utf-8',
        'js' => 'text/javascript; charset=utf-8', 'mjs' => 'text/javascript; charset=utf-8',
        'json' => 'application/json; charset=utf-8', 'map' => 'application/json',
        'css' => 'text/css; charset=utf-8', 'html' => 'text/html; charset=utf-8',
        'md' => 'text/markdown; charset=utf-8', 'txt' => 'text/plain; charset=utf-8',
        'sh' => 'text/plain; charset=utf-8', 'yml' => 'text/plain; charset=utf-8',
        'yaml' => 'text/plain; charset=utf-8', 'conf' => 'text/plain; charset=utf-8',
        'ini' => 'text/plain; charset=utf-8', 'env' => 'text/plain; charset=utf-8',
        'properties' => 'text/plain; charset=utf-8', 'gradle' => 'text/plain; charset=utf-8',
        'pro' => 'text/plain; charset=utf-8', 'java' => 'text/plain; charset=utf-8',
        'kt' => 'text/plain; charset=utf-8', 'xml' => 'application/xml; charset=utf-8',
        'png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg',
        'gif' => 'image/gif', 'webp' => 'image/webp', 'svg' => 'image/svg+xml',
        'ico' => 'image/x-icon', 'apk' => 'application/vnd.android.package-archive',
        'zip' => 'application/zip', 'gz' => 'application/gzip', 'tar' => 'application/x-tar',
        'pdf' => 'application/pdf', 'woff' => 'font/woff', 'woff2' => 'font/woff2',
        'ttf' => 'font/ttf', 'mp4' => 'video/mp4', 'wasm' => 'application/wasm',
        'keystore' => 'application/octet-stream', 'jar' => 'application/java-archive',
    );
    return isset($map[$ext]) ? $map[$ext] : 'application/octet-stream';
}

// Berkas teks (boleh ditampilkan langsung di peramban).
function gak_is_text($name)
{
    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    $texts = array('php', 'py', 'js', 'mjs', 'json', 'map', 'css', 'md', 'txt', 'sh', 'yml',
        'yaml', 'conf', 'ini', 'env', 'properties', 'gradle', 'pro', 'java', 'kt', 'xml',
        'html', 'htaccess', 'lock', 'log', 'csv', 'sql', 'bat', 'ps1', 'desktop', 'url', 'jsonl');
    return in_array($ext, $texts, true) || $ext === '';
}

// Ukuran berkas dalam bentuk manusiawi.
function gak_size_h($n)
{
    if ($n < 1024) {
        return $n . ' B';
    }
    if ($n < 1024 * 1024) {
        return number_format($n / 1024, 1, ',', '.') . ' KB';
    }
    return number_format($n / 1048576, 2, ',', '.') . ' MB';
}

// Kirim isi berkas ke output (mengalir — tidak dimuat seluruhnya ke memori).
function gak_send_file($path)
{
    $fp = @fopen($path, 'rb');
    if (!$fp) {
        return false;
    }
    while (!feof($fp)) {
        $chunk = fread($fp, 262144);
        if ($chunk === false || $chunk === '') {
            break;
        }
        echo $chunk;
    }
    fclose($fp);
    return true;
}
