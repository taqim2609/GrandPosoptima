<?php
// Halaman daftar berkas proyek (tanpa kompresi).
//
// Rancangan penting (pelajaran dari versi "optimized" yang pernah diusulkan):
//  - Pagination TIDAK boleh memotong daftar SEBELUM pencarian — kalau dipotong dulu,
//    kotak cari hanya menelusuri segelintir berkas dan berkas seperti backend/server.py
//    menjadi "tidak ada". Karena itu pencarian dilakukan di SERVER atas SELURUH daftar,
//    lalu hasilnya yang dipaginasi (?q=...&page=2).
//  - Pencarian tetap bekerja tanpa JavaScript (form GET biasa); JavaScript hanya
//    menambah kenyamanan: jeda 300 ms sebelum mengirim (debounce) + menyaring baris
//    yang sedang terlihat seketika supaya terasa langsung.
require __DIR__ . '/lib.php';

$DIR     = gak_project_dir();
$PER     = 20;
$ALL     = gak_project_list($DIR);            // seluruh berkas, terurut, dari cache versi
$Q       = isset($_GET['q']) ? trim((string) $_GET['q']) : '';
$ROWS    = gak_project_filter($ALL, $Q);      // pencarian dulu, paginasi belakangan
$TOTAL_ALL  = count($ALL);
$TOTAL_ROWS = count($ROWS);
$PAGES   = max(1, (int) ceil($TOTAL_ROWS / $PER));
$PAGE    = isset($_GET['page']) ? max(1, (int) $_GET['page']) : 1;
if ($PAGE > $PAGES) {
    $PAGE = $PAGES;
}
$OFFSET  = ($PAGE - 1) * $PER;
$SHOWN   = array_slice($ROWS, $OFFSET, $PER);
$FIRST   = $TOTAL_ROWS ? $OFFSET + 1 : 0;
$LAST    = $OFFSET + count($SHOWN);
$SUM_ALL = 0;
foreach ($ALL as $e) {
    $SUM_ALL += $e['size'];
}
$GZ      = __DIR__ . '/pos-grand.tar.gz';

$ver = '';
$upd = '';
$vj  = __DIR__ . '/version.json';
if (is_file($vj)) {
    $j = json_decode((string) file_get_contents($vj), true);
    if (is_array($j)) {
        $ver = isset($j['version']) ? (string) $j['version'] : '';
        $upd = isset($j['updated']) ? (string) $j['updated'] : '';
    }
}

function h($s) { return htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8'); }
function stat_of($path) { return is_file($path) ? gak_size_h(filesize($path)) : '—'; }
function page_url($q, $page)
{
    $p = array();
    if ($q !== '') {
        $p['q'] = $q;
    }
    if ($page > 1) {
        $p['page'] = $page;
    }
    return 'files.php' . ($p ? '?' . http_build_query($p) : '');
}
?>
<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Berkas Proyek — Grand Aceh Kuliner POS</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, "Segoe UI", Roboto, system-ui, sans-serif;
    background: linear-gradient(135deg, #EEF2FF 0%, #F5F3FF 45%, #FDF2F8 100%);
    min-height: 100vh; padding: 20px; color: #1F1B3A;
  }
  .wrap { max-width: 900px; margin: 0 auto; }
  .card {
    background: rgba(255,255,255,0.74);
    backdrop-filter: blur(18px) saturate(160%);
    -webkit-backdrop-filter: blur(18px) saturate(160%);
    border: 1px solid rgba(255,255,255,0.8);
    border-radius: 18px;
    box-shadow: 0 14px 38px rgba(79,70,229,0.12);
    padding: 22px 20px;
    margin-bottom: 18px;
  }
  h1 { font-size: 19px; margin-bottom: 4px; }
  .sub { color: #635F82; font-size: 13px; line-height: 1.6; }
  .ver {
    display: inline-block; background: #4F46E5; color: #fff; border-radius: 999px;
    padding: 3px 12px; font-size: 12.5px; font-weight: 700; margin: 10px 0 4px;
  }
  .btns { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; }
  a.btn {
    display: inline-block; text-decoration: none; font-weight: 700; font-size: 13.5px;
    border-radius: 11px; padding: 10px 14px; color: #fff;
    background: linear-gradient(90deg, #4F46E5, #8B5CF6);
  }
  a.btn.ghost { background: rgba(79,70,229,0.10); color: #4F46E5; }
  .toolbar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  input[type=search] {
    flex: 1 1 220px; min-width: 180px; font-size: 14px; font-family: inherit;
    padding: 11px 13px; border-radius: 11px; color: #1F1B3A;
    border: 1px solid rgba(79,70,229,0.25); background: rgba(255,255,255,0.9);
  }
  input[type=search]:focus { outline: 2px solid rgba(79,70,229,0.35); }
  .count { color: #635F82; font-size: 12.5px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  td { padding: 8px 6px; border-bottom: 1px solid rgba(79,70,229,0.10); vertical-align: middle; }
  tr.row:hover { background: rgba(79,70,229,0.05); }
  td.p { font-size: 13px; word-break: break-all; }
  td.p .dir { color: #8b87a8; }
  td.p a { color: #2b2550; text-decoration: none; font-weight: 600; }
  td.p a:hover { color: #4F46E5; text-decoration: underline; }
  td.s { font-size: 12px; color: #635F82; white-space: nowrap; text-align: right; width: 78px; }
  td.a { white-space: nowrap; text-align: right; width: 108px; }
  td.a a {
    display: inline-block; font-size: 12px; font-weight: 700; text-decoration: none;
    border-radius: 9px; padding: 6px 9px; margin-left: 4px;
  }
  td.a a.dl { background: rgba(79,70,229,0.12); color: #4F46E5; }
  td.a a.vw { background: rgba(139,92,246,0.12); color: #7C3AED; }
  .foot { color: #8b87a8; font-size: 12px; text-align: center; margin: 6px 0 24px; }
  .foot a { color: #4F46E5; }
  .empty { color: #635F82; font-size: 13.5px; line-height: 1.7; margin-top: 12px; }
  code.k { background: #1F1B3A; color: #C7D2FE; border-radius: 8px; padding: 2px 7px; font-size: 12px; }
  .pager { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; justify-content: center; margin-top: 18px; }
  .pager a, .pager span.pg {
    display: inline-block; min-width: 36px; text-align: center; padding: 8px 10px;
    border-radius: 9px; text-decoration: none; font-size: 13px;
  }
  .pager a { background: rgba(79,70,229,0.10); color: #4F46E5; font-weight: 600; }
  .pager a:hover { background: rgba(79,70,229,0.20); }
  .pager span.pg { background: #4F46E5; color: #fff; font-weight: 700; }
  .pager span.gap { color: #8b87a8; }
  .hint { color: #635F82; font-size: 12px; margin-top: 10px; }
  .banner {
    margin-top: 14px; padding: 10px 12px; border-radius: 11px; font-size: 13px;
    background: rgba(79,70,229,0.08); color: #2b2550;
  }
</style>
</head>
<body>
<div class="wrap">

  <div class="card">
    <h1>Berkas Proyek (tanpa kompresi)</h1>
    <div class="sub">
      Ini folder proyek apa adanya — <b><?= (int) $TOTAL_ALL ?> berkas</b> dari
      <code class="k">project/</code>, bisa diunduh <b>satu per satu</b>
      (mis. <code class="k">backend/server.py</code> saja) atau dibaca langsung di peramban.
      Tidak perlu mengunduh arsip apa pun.
    </div>
    <?php if ($ver !== ''): ?>
      <div class="ver">versi: <?= h($ver) ?><?= $upd !== '' ? ' — ' . h($upd) : '' ?></div>
    <?php endif; ?>
    <div class="btns">
      <?php if (is_file($GZ)): ?>
        <a class="btn ghost" href="archive.php?f=pos-grand.tar.gz" download>⬇ pos-grand.tar.gz (<?= h(stat_of($GZ)) ?>) — untuk update otomatis server</a>
      <?php endif; ?>
      <a class="btn ghost" href="index.php">← Kembali ke Update Center</a>
    </div>
    <div class="sub" style="margin-top:10px">
      Total isi seluruh berkas: <b><?= h(gak_size_h($SUM_ALL)) ?></b>.
      Klik nama berkas untuk membacanya (berkas teks), atau tombol untuk mengunduh.
    </div>
  </div>

  <div class="card">
    <form class="toolbar" method="get" action="files.php" id="cari">
      <input type="search" id="q" name="q" value="<?= h($Q) ?>"
             placeholder="Cari di SELURUH <?= (int) $TOTAL_ALL ?> berkas… (mis. server.py, Reports, docker)"
             autocomplete="off" />
      <button class="btn" type="submit" style="border:0;cursor:pointer">Cari</button>
      <div class="count" id="cnt"></div>
    </form>

    <?php if ($Q !== ''): ?>
      <div class="banner">
        Hasil pencarian <b><?= h($Q) ?></b>: <b><?= (int) $TOTAL_ROWS ?></b> berkas
        dari <?= (int) $TOTAL_ALL ?>. <a href="files.php">Tampilkan semua berkas</a>
      </div>
    <?php endif; ?>

    <?php if (!$SHOWN): ?>
      <div class="empty">
        <?php if ($Q !== ''): ?>
          Tidak ada berkas yang cocok dengan <code class="k"><?= h($Q) ?></code>.
          <a href="files.php">Tampilkan semua berkas</a>
        <?php else: ?>
          Folder <code class="k">project/</code> belum ada atau kosong.
        <?php endif; ?>
      </div>
    <?php else: ?>
      <table>
        <?php foreach ($SHOWN as $e): $n = $e['name']; $slash = strrpos($n, '/'); ?>
          <tr class="row" data-p="<?= h(strtolower($n)) ?>">
            <td class="p">
              <?php if ($slash !== false): ?>
                <span class="dir"><?= h(substr($n, 0, $slash + 1)) ?></span><?php echo h(substr($n, $slash + 1)); ?>
              <?php else: ?>
                <?= h($n) ?>
              <?php endif; ?>
            </td>
            <td class="s"><?= h(gak_size_h($e['size'])) ?></td>
            <td class="a">
              <a class="dl" href="file.php?f=<?= h(rawurlencode($n)) ?>" download>Unduh</a>
              <?php if (gak_is_text($n)): ?>
                <a class="vw" href="file.php?f=<?= h(rawurlencode($n)) ?>&amp;inline=1" target="_blank" rel="noopener">Lihat</a>
              <?php endif; ?>
            </td>
          </tr>
        <?php endforeach; ?>
      </table>

      <?php if ($PAGES > 1): ?>
        <div class="pager" id="pager">
          <?php if ($PAGE > 1): ?>
            <a href="<?= h(page_url($Q, 1)) ?>">«</a>
            <a href="<?= h(page_url($Q, $PAGE - 1)) ?>">‹ Sebelumnya</a>
          <?php endif; ?>
          <?php
            $from = max(1, $PAGE - 2);
            $to   = min($PAGES, $PAGE + 2);
          if ($from > 1): ?>
            <a href="<?= h(page_url($Q, 1)) ?>">1</a><span class="gap">…</span>
          <?php endif;
          for ($i = $from; $i <= $to; $i++): ?>
            <?php if ($i === $PAGE): ?>
              <span class="pg"><?= $i ?></span>
            <?php else: ?>
              <a href="<?= h(page_url($Q, $i)) ?>"><?= $i ?></a>
            <?php endif; ?>
          <?php endfor;
          if ($to < $PAGES): ?>
            <span class="gap">…</span><a href="<?= h(page_url($Q, $PAGES)) ?>"><?= $PAGES ?></a>
          <?php endif;
          if ($PAGE < $PAGES): ?>
            <a href="<?= h(page_url($Q, $PAGE + 1)) ?>">Selanjutnya ›</a>
            <a href="<?= h(page_url($Q, $PAGES)) ?>">»</a>
          <?php endif; ?>
        </div>
        <div class="foot">Halaman <?= (int) $PAGE ?> dari <?= (int) $PAGES ?>
          (berkas <?= (int) $FIRST ?>–<?= (int) $LAST ?> dari <?= (int) $TOTAL_ROWS ?><?= $Q !== '' ? ' hasil pencarian' : '' ?>)</div>
      <?php endif; ?>
    <?php endif; ?>

    <div class="hint" id="hint">
      Dicari di seluruh <?= (int) $TOTAL_ALL ?> berkas (bukan hanya halaman ini), lalu ditampilkan 20 per halaman.
    </div>
  </div>

  <div class="foot">
    Update Center Grand Aceh Kuliner POS · <a href="index.php">halaman utama</a>
  </div>
</div>

<script>
(function () {
  var form  = document.getElementById('cari');
  var q     = document.getElementById('q');
  var cnt   = document.getElementById('cnt');
  var rows  = document.querySelectorAll('tr.row');
  var totalIni = rows.length;          // baris yang ADA di halaman ini
  var totalSemua = <?= (int) $TOTAL_ROWS ?>;
  var timer = null;

  function hitung() {
    var s = (q.value || '').toLowerCase().replace(/^\s+|\s+$/g, '');
    var vis = 0;
    for (var i = 0; i < rows.length; i++) {
      var teks = rows[i].getAttribute('data-p') || '';
      var tampil = (s === '' || teks.indexOf(s) !== -1);
      rows[i].style.display = tampil ? '' : 'none';
      if (tampil) { vis++; }
    }
    if (s === '') {
      cnt.textContent = 'Menampilkan ' + totalSemua + ' berkas (' + totalIni + ' di halaman ini)';
    } else {
      cnt.textContent = 'Cocok di halaman ini: ' + vis + ' — mencari di SEMUA berkas…';
    }
  }

  function kirim() {
    // Kirim ke server supaya pencarian mencakup SEMUA berkas, bukan hanya halaman ini.
    var s = q.value;
    if (s === <?= json_encode($Q) ?>) { return; }     // tidak berubah → tidak perlu memuat ulang
    if (s.replace(/^\s+|\s+$/g, '') === '') { q.disabled = true; }  // jangan tinggalkan "?q=" di URL
    form.submit();
  }

  function onInput() {
    hitung();                                          // umpan balik seketika (murah: <=20 baris)
    clearTimeout(timer);
    timer = setTimeout(kirim, 300);                    // debounce 300 ms
  }

  q.addEventListener('input', onInput);
  form.addEventListener('submit', function () {
    timer = null;
    if ((q.value || '').replace(/^\s+|\s+$/g, '') === '') { q.disabled = true; }
  });
  hitung();
})();
</script>
</body>
</html>
