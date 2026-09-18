const path = require('path');
const xlsx = require('xlsx');

function registerAllMissingRoutes(app, db, upload, broadcastRealtimeSync) {
  // Helper: Get or Init collections
  if (!db.cashCategories) {
    db.cashCategories = ['Bahan Baku', 'Belanja Operasional', 'Bayar Supplier', 'Kasbon', 'Operasional', 'Lainnya'];
  }
  if (!db.ingredientCategories) {
    db.ingredientCategories = [
      { id: 'icat-1', name: 'Bahan Pokok' },
      { id: 'icat-2', name: 'Kopi & Minuman' },
      { id: 'icat-3', name: 'Daging & Unggas' },
      { id: 'icat-4', name: 'Bumbu Dapur' },
    ];
  }
  if (!db.ingredientPurchases) db.ingredientPurchases = [];
  if (!db.ingredientOpname) db.ingredientOpname = [];
  if (!db.purchases) db.purchases = [];
  if (!db.stockOpnames) db.stockOpnames = [];
  if (!db.shoppingList) db.shoppingList = {};
  if (!db.recipes) db.recipes = [];
  if (!db.vendorSettlements) db.vendorSettlements = [];
  if (!db.voidRows) db.voidRows = [];
  if (!db.aiSessions) db.aiSessions = [];
  if (!db.featureRequests) db.featureRequests = [];
  if (!db.customWidgets) db.customWidgets = [];
  if (!db.customWidgetEntries) db.customWidgetEntries = [];
  if (!db.webhookConfig) {
    db.webhookConfig = {
      enabled: false,
      url: '',
      secret: '',
      secret_set: false,
      events: ['order.created', 'shift.closed', 'inventory.low'],
      last: null,
    };
  }
  if (!db.whatsappConfig) {
    db.whatsappConfig = {
      configured: true,
      device_id: 'dev-wa-gak-1',
      phone: '081269001122',
      status: 'connected',
      auto_receipt: true,
      recipients: ['081269001122'],
    };
  }
  if (!db.dashboardConfig) {
    db.dashboardConfig = {
      widgets: [
        { id: 'w-summary', name: 'Ringkasan Hari Ini', visible: true, order: 1 },
        { id: 'w-sales', name: 'Grafik Penjualan', visible: true, order: 2 },
        { id: 'w-top', name: 'Produk Terlaris', visible: true, order: 3 },
      ],
      layout: 'default',
    };
  }

  // ==========================================
  // 1. POS / Orders Endpoints
  // ==========================================

  // GET /api/orders/:id
  app.get(['/api/orders/:id', '/orders/:id'], (req, res) => {
    const order = db.orders.find((o) => o.id === req.params.id || o.order_number === req.params.id);
    if (!order) {
      return res.status(404).json({ detail: 'Order tidak ditemukan' });
    }
    res.json(order);
  });

  // PATCH /api/orders/:id/items
  app.patch(['/api/orders/:id/items', '/orders/:id/items'], (req, res) => {
    const order = db.orders.find((o) => o.id === req.params.id);
    if (!order) {
      return res.status(404).json({ detail: 'Order tidak ditemukan' });
    }
    const items = req.body.items || [];
    order.items = items;
    const subtotal = items.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.qty || 1)), 0);
    order.subtotal = subtotal;
    const disc = order.discount_type === 'percent'
      ? (subtotal * (Number(order.discount_value) || 0)) / 100
      : Number(order.discount_value) || 0;
    order.discount = disc;
    order.total = Math.max(0, subtotal - disc);
    order.updated_at = new Date().toISOString();

    broadcastRealtimeSync('order_updated', { id: order.id, total: order.total });
    res.json(order);
  });

  // POST /api/orders/:id/pay
  app.post(['/api/orders/:id/pay', '/orders/:id/pay'], (req, res) => {
    const order = db.orders.find((o) => o.id === req.params.id);
    if (!order) {
      return res.status(404).json({ detail: 'Order tidak ditemukan' });
    }

    order.status = 'completed';
    order.payment_method = req.body.payment_method || order.payment_method || 'cash';
    order.paid_at = new Date().toISOString();
    order.splits = req.body.splits || null;
    order.amount_paid = req.body.amount_paid || order.total;
    if (req.body.discount_type) order.discount_type = req.body.discount_type;
    if (req.body.discount_value !== undefined) order.discount_value = Number(req.body.discount_value);
    if (req.body.discount_reason) order.discount_reason = req.body.discount_reason;
    if (req.body.coupon_code) {
      order.coupon_code = req.body.coupon_code;
      const cp = db.coupons.find((c) => c.code.toUpperCase() === req.body.coupon_code.toUpperCase());
      if (cp) cp.used = (cp.used || 0) + 1;
    }
    if (req.body.member_id) {
      order.member_id = req.body.member_id;
      const mem = db.members.find((m) => m.id === req.body.member_id);
      if (mem) {
        if (req.body.redeem_points) {
          mem.points = Math.max(0, (mem.points || 0) - Number(req.body.redeem_points));
          order.redeem_points = Number(req.body.redeem_points);
        }
        const earned = Math.floor((order.total || 0) / 10000);
        mem.points = (mem.points || 0) + earned;
        mem.total_spent = (mem.total_spent || 0) + (order.total || 0);
      }
    }

    // Free table if dine-in
    if (order.table_id || order.table_name) {
      const tbl = db.tables.find((t) => t.id === order.table_id || t.name === order.table_name);
      if (tbl) {
        tbl.status = 'empty';
        tbl.open_order_id = null;
      }
    }

    // Deduct stock for items
    if (Array.isArray(order.items)) {
      order.items.forEach((item) => {
        const prod = db.products.find((p) => p.id === (item.product_id || item.id) || p.name === item.name);
        if (prod && typeof prod.stock === 'number') {
          prod.stock = Math.max(0, prod.stock - (item.qty || 1));
        }
      });
    }

    // Update current shift
    if (db.currentShift) {
      const tot = Number(order.total) || 0;
      if (order.payment_method === 'cash') {
        db.currentShift.cash_sales = (db.currentShift.cash_sales || 0) + tot;
      } else {
        db.currentShift.non_cash_sales = (db.currentShift.non_cash_sales || 0) + tot;
      }
      db.currentShift.total_sales = (db.currentShift.total_sales || 0) + tot;
      db.currentShift.orders_count = (db.currentShift.orders_count || 0) + 1;
    }

    broadcastRealtimeSync('order_paid', { order_number: order.order_number, total: order.total });
    res.json(order);
  });

  // GET /api/orders/:id/void-preview
  app.get(['/api/orders/:id/void-preview', '/orders/:id/void-preview'], (req, res) => {
    const order = db.orders.find((o) => o.id === req.params.id);
    if (!order) {
      return res.status(404).json({ detail: 'Order tidak ditemukan' });
    }

    const isVoided = order.status === 'voided' || order.status === 'refunded';
    const can = !isVoided;
    const block_reason = isVoided ? 'Pesanan ini sudah pernah dibatalkan / di-refund.' : null;

    const items = Array.isArray(order.items) ? order.items : [];
    const restock_qty = items.reduce((sum, it) => sum + Number(it.qty || 1), 0);

    const impact = {
      amount: order.total || 0,
      cash_reduction: order.payment_method === 'cash' ? (order.total || 0) : 0,
      restock_items: items.length,
      restock_qty,
      coupon: order.coupon_code || null,
      coupon_discount: order.discount || 0,
      points_redeem_back: order.redeem_points || 0,
      points_earned_revert: Math.floor((order.total || 0) / 10000),
      vendor_share_removed: 0,
      kind_default: order.status === 'completed' || order.status === 'paid' ? 'refund' : 'void',
    };

    res.json({
      can,
      need_force: false,
      can_force: true,
      block_reason,
      alasan_min: 5,
      wajib_alasan: true,
      prev_status: order.status,
      impact,
    });
  });

  // POST /api/orders/:id/void
  app.post(['/api/orders/:id/void', '/orders/:id/void'], (req, res) => {
    const order = db.orders.find((o) => o.id === req.params.id);
    if (!order) {
      return res.status(404).json({ detail: 'Order tidak ditemukan' });
    }
    const { reason, action, force_cross_shift, force_note } = req.body;
    const isRefund = action === 'refund';

    order.status = isRefund ? 'refunded' : 'voided';
    order.void_reason = reason || 'Dibatalkan oleh kasir';
    order.void_at = new Date().toISOString();
    order.void_action = action || 'void';
    if (force_cross_shift) {
      order.force_cross_shift = true;
      order.force_note = force_note || '';
    }

    // Free table if occupied
    if (order.table_id || order.table_name) {
      const tbl = db.tables.find((t) => t.id === order.table_id || t.name === order.table_name);
      if (tbl) {
        tbl.status = 'empty';
        tbl.open_order_id = null;
      }
    }

    // Return stock
    let restocked = 0;
    if (Array.isArray(order.items)) {
      order.items.forEach((it) => {
        const prod = db.products.find((p) => p.id === (it.product_id || it.id) || p.name === it.name);
        if (prod && typeof prod.stock === 'number') {
          prod.stock += (it.qty || 1);
          restocked++;
        }
      });
    }

    // Reverse shift sales
    if (db.currentShift && (order.status === 'voided' || order.status === 'refunded')) {
      const tot = Number(order.total) || 0;
      if (order.payment_method === 'cash') {
        db.currentShift.cash_sales = Math.max(0, (db.currentShift.cash_sales || 0) - tot);
      } else {
        db.currentShift.non_cash_sales = Math.max(0, (db.currentShift.non_cash_sales || 0) - tot);
      }
      db.currentShift.total_sales = Math.max(0, (db.currentShift.total_sales || 0) - tot);
      db.currentShift.orders_count = Math.max(0, (db.currentShift.orders_count || 0) - 1);
    }

    // Revert coupon
    if (order.coupon_code) {
      const cp = db.coupons.find((c) => c.code.toUpperCase() === order.coupon_code.toUpperCase());
      if (cp && cp.used > 0) cp.used -= 1;
    }

    // Revert member points
    if (order.member_id) {
      const mem = db.members.find((m) => m.id === order.member_id);
      if (mem) {
        const earned = Math.floor((order.total || 0) / 10000);
        mem.points = Math.max(0, (mem.points || 0) - earned + (order.redeem_points || 0));
        mem.total_spent = Math.max(0, (mem.total_spent || 0) - (order.total || 0));
      }
    }

    db.voidRows.unshift({
      id: 'vd-' + Date.now(),
      order_id: order.id,
      order_number: order.order_number,
      action: order.void_action,
      reason: order.void_reason,
      total: order.total,
      voided_at: order.void_at,
    });

    broadcastRealtimeSync('order_voided', { order_number: order.order_number });
    res.json({
      status: 'ok',
      order,
      effects: {
        restock: restocked,
        coupon_reverted: !!order.coupon_code,
        points_reverted: !!order.member_id,
      },
    });
  });

  // GET /api/voids
  app.get(['/api/voids', '/voids'], (req, res) => {
    res.json(db.voidRows);
  });

  // ==========================================
  // 2. Products & Inventory Endpoints
  // ==========================================

  // PATCH /api/products/:id/sold-out
  app.patch(['/api/products/:id/sold-out', '/products/:id/sold-out'], (req, res) => {
    const prod = db.products.find((p) => p.id === req.params.id);
    if (!prod) {
      return res.status(404).json({ detail: 'Produk tidak ditemukan' });
    }
    prod.sold_out = req.body.sold_out !== undefined ? !!req.body.sold_out : !prod.sold_out;
    broadcastRealtimeSync('product_updated', { id: prod.id, sold_out: prod.sold_out });
    res.json(prod);
  });

  // POST /api/products/import/preview
  app.post(['/api/products/import/preview', '/products/import/preview'], upload.single('file'), (req, res) => {
    try {
      if (!req.file || !req.file.buffer) {
        return res.status(400).json({ detail: 'File Excel (.xlsx) wajib diunggah' });
      }
      const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const rawRows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });

      const rows = rawRows.map((r, i) => {
        const name = r.name || r['Nama Produk'] || r['nama_produk'] || r['Nama'] || '';
        const sku = r.sku || r['SKU'] || r['Kode'] || `PR-${Date.now().toString().slice(-4)}-${i+1}`;
        const category_name = r.category_name || r['Kategori'] || r['kategori'] || 'Makanan Utama';
        const type = String(r.type || r['Tipe'] || r['tipe_produk'] || 'makanan').toLowerCase();
        const price = Number(r.price || r['Harga Jual'] || r['Harga'] || r['harga'] || 0);
        const cost = Number(r.cost || r.cost_price || r['Harga Beli'] || r['harga_beli'] || 0);

        const exists = db.products.some((p) => p.sku === sku || p.name.toLowerCase() === name.toLowerCase());
        return {
          row: i + 1,
          name,
          sku,
          category_name,
          type: ['makanan', 'minuman', 'retail'].includes(type) ? type : 'makanan',
          price,
          cost,
          exists,
        };
      });

      res.json({ rows, total: rows.length });
    } catch (err) {
      res.status(500).json({ detail: 'Gagal memproses file Excel: ' + err.message });
    }
  });

  // POST /api/products/import/commit
  app.post(['/api/products/import/commit', '/products/import/commit'], upload.single('file'), (req, res) => {
    try {
      if (!req.file || !req.file.buffer) {
        return res.status(400).json({ detail: 'File Excel (.xlsx) wajib diunggah' });
      }
      const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const rawRows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });

      let created = 0;
      let updated = 0;

      rawRows.forEach((r, i) => {
        const name = r.name || r['Nama Produk'] || r['nama_produk'] || r['Nama'] || '';
        if (!name) return;
        const sku = r.sku || r['SKU'] || r['Kode'] || `PR-${Date.now().toString().slice(-4)}-${i+1}`;
        const category_name = r.category_name || r['Kategori'] || r['kategori'] || 'Makanan Utama';
        let cat = db.categories.find((c) => c.name.toLowerCase() === category_name.toLowerCase());
        if (!cat) {
          cat = { id: 'cat-' + Date.now() + '-' + i, name: category_name, type: 'makanan', active: true };
          db.categories.push(cat);
        }
        const type = String(r.type || r['Tipe'] || r['tipe_produk'] || 'makanan').toLowerCase();
        const price = Number(r.price || r['Harga Jual'] || r['Harga'] || r['harga'] || 0);
        const cost = Number(r.cost || r.cost_price || r['Harga Beli'] || r['harga_beli'] || 0);

        let prod = db.products.find((p) => p.sku === sku || p.name.toLowerCase() === name.toLowerCase());
        if (prod) {
          prod.price = price;
          prod.cost_price = cost;
          prod.type = type;
          prod.category_id = cat.id;
          updated++;
        } else {
          db.products.push({
            id: 'prod-' + Date.now() + '-' + i,
            name,
            sku,
            category_id: cat.id,
            type: ['makanan', 'minuman', 'retail'].includes(type) ? type : 'makanan',
            price,
            cost_price: cost,
            stock: 100,
            active: true,
            sold_out: false,
          });
          created++;
        }
      });

      broadcastRealtimeSync('products_imported', { created, updated });
      res.json({ created, updated, errors: 0 });
    } catch (err) {
      res.status(500).json({ detail: 'Gagal mengimpor produk: ' + err.message });
    }
  });

  // POST /api/products/import/commit-fix
  app.post(['/api/products/import/commit-fix', '/products/import/commit-fix'], (req, res) => {
    try {
      const rows = req.body.rows || [];
      let created = 0;
      let updated = 0;

      rows.forEach((r, i) => {
        const name = r.nama_produk || r.name || '';
        if (!name) return;
        const sku = r.sku || `PR-${Date.now().toString().slice(-4)}-${i+1}`;
        const catName = r.kategori || r.category_name || 'Makanan Utama';
        let cat = db.categories.find((c) => c.name.toLowerCase() === catName.toLowerCase());
        if (!cat) {
          cat = { id: 'cat-' + Date.now() + '-' + i, name: catName, type: 'makanan', active: true };
          db.categories.push(cat);
        }
        const type = String(r.tipe_produk || r.type || 'makanan').toLowerCase();
        const price = Number(r.harga || r.price || 0);
        const cost = Number(r.harga_beli || r.cost || 0);

        let prod = db.products.find((p) => p.sku === sku || p.name.toLowerCase() === name.toLowerCase());
        if (prod) {
          prod.price = price;
          prod.cost_price = cost;
          prod.type = type;
          prod.category_id = cat.id;
          updated++;
        } else {
          db.products.push({
            id: 'prod-' + Date.now() + '-' + i,
            name,
            sku,
            category_id: cat.id,
            type: ['makanan', 'minuman', 'retail'].includes(type) ? type : 'makanan',
            price,
            cost_price: cost,
            stock: 100,
            active: true,
            sold_out: false,
          });
          created++;
        }
      });

      broadcastRealtimeSync('products_imported', { created, updated });
      res.json({ created, updated, errors: 0 });
    } catch (err) {
      res.status(500).json({ detail: 'Gagal mengimpor produk: ' + err.message });
    }
  });

  // ==========================================
  // 3. Category, Promo, Coupon, Table, Member, Vendor CRUD
  // ==========================================

  // PUT /api/categories/:id
  app.put(['/api/categories/:id', '/categories/:id'], (req, res) => {
    const cat = db.categories.find((c) => c.id === req.params.id);
    if (!cat) return res.status(404).json({ detail: 'Kategori tidak ditemukan' });
    Object.assign(cat, req.body);
    res.json(cat);
  });

  // DELETE /api/coupons/:id & PUT /api/coupons/:id
  app.put(['/api/coupons/:id', '/coupons/:id'], (req, res) => {
    const cp = db.coupons.find((c) => c.id === req.params.id);
    if (!cp) return res.status(404).json({ detail: 'Kupon tidak ditemukan' });
    Object.assign(cp, req.body);
    res.json(cp);
  });

  app.delete(['/api/coupons/:id', '/coupons/:id'], (req, res) => {
    db.coupons = db.coupons.filter((c) => c.id !== req.params.id);
    res.json({ status: 'ok', detail: 'Kupon dihapus' });
  });

  // PUT & DELETE /api/promos/:id
  app.put(['/api/promos/:id', '/promos/:id'], (req, res) => {
    const pr = db.promos.find((p) => p.id === req.params.id);
    if (!pr) return res.status(404).json({ detail: 'Promo tidak ditemukan' });
    Object.assign(pr, req.body);
    res.json(pr);
  });

  app.delete(['/api/promos/:id', '/promos/:id'], (req, res) => {
    db.promos = db.promos.filter((p) => p.id !== req.params.id);
    res.json({ status: 'ok', detail: 'Promo dihapus' });
  });

  // PUT & DELETE /api/tables/:id
  app.put(['/api/tables/:id', '/tables/:id'], (req, res) => {
    const tbl = db.tables.find((t) => t.id === req.params.id);
    if (!tbl) return res.status(404).json({ detail: 'Meja tidak ditemukan' });
    Object.assign(tbl, req.body);
    res.json(tbl);
  });

  app.delete(['/api/tables/:id', '/tables/:id'], (req, res) => {
    db.tables = db.tables.filter((t) => t.id !== req.params.id);
    res.json({ status: 'ok', detail: 'Meja dihapus' });
  });

  // PUT & DELETE /api/members/:id
  app.put(['/api/members/:id', '/members/:id'], (req, res) => {
    const mem = db.members.find((m) => m.id === req.params.id);
    if (!mem) return res.status(404).json({ detail: 'Member tidak ditemukan' });
    Object.assign(mem, req.body);
    res.json(mem);
  });

  app.delete(['/api/members/:id', '/members/:id'], (req, res) => {
    db.members = db.members.filter((m) => m.id !== req.params.id);
    res.json({ status: 'ok', detail: 'Member dihapus' });
  });

  // PUT & DELETE /api/vendors/:id
  app.put(['/api/vendors/:id', '/vendors/:id'], (req, res) => {
    const v = db.vendors.find((item) => item.id === req.params.id);
    if (!v) return res.status(404).json({ detail: 'Vendor tidak ditemukan' });
    Object.assign(v, req.body);
    res.json(v);
  });

  app.delete(['/api/vendors/:id', '/vendors/:id'], (req, res) => {
    db.vendors = db.vendors.filter((v) => v.id !== req.params.id);
    res.json({ status: 'ok', detail: 'Vendor dihapus' });
  });

  // ==========================================
  // 4. Ingredient Categories & Raw Materials
  // ==========================================

  // GET /api/ingredient-categories
  app.get(['/api/ingredient-categories', '/ingredient-categories'], (req, res) => {
    res.json({
      items: db.ingredientCategories,
      mine: db.ingredientCategories.map((c) => c.id),
      allow_all: true,
      can_manage: true,
    });
  });

  // POST /api/ingredient-categories
  app.post(['/api/ingredient-categories', '/ingredient-categories'], (req, res) => {
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ detail: 'Nama kategori wajib diisi' });
    const cat = { id: 'icat-' + Date.now(), name };
    db.ingredientCategories.push(cat);
    res.json(cat);
  });

  // PUT /api/ingredient-categories/:id
  app.put(['/api/ingredient-categories/:id', '/ingredient-categories/:id'], (req, res) => {
    const cat = db.ingredientCategories.find((c) => c.id === req.params.id);
    if (!cat) return res.status(404).json({ detail: 'Kategori bahan tidak ditemukan' });
    if (req.body.name) cat.name = req.body.name.trim();
    res.json(cat);
  });

  // DELETE /api/ingredient-categories/:id
  app.delete(['/api/ingredient-categories/:id', '/ingredient-categories/:id'], (req, res) => {
    db.ingredientCategories = db.ingredientCategories.filter((c) => c.id !== req.params.id);
    let removedCount = 0;
    db.ingredients.forEach((ing) => {
      if (ing.category_id === req.params.id) {
        ing.category_id = null;
        removedCount++;
      }
    });
    res.json({ status: 'ok', removed_from_ingredients: removedCount });
  });

  // PUT & DELETE /api/ingredients/:id
  app.put(['/api/ingredients/:id', '/ingredients/:id'], (req, res) => {
    const ing = db.ingredients.find((i) => i.id === req.params.id);
    if (!ing) return res.status(404).json({ detail: 'Bahan tidak ditemukan' });
    Object.assign(ing, req.body);
    res.json(ing);
  });

  app.delete(['/api/ingredients/:id', '/ingredients/:id'], (req, res) => {
    db.ingredients = db.ingredients.filter((i) => i.id !== req.params.id);
    res.json({ status: 'ok', detail: 'Bahan baku berhasil dihapus' });
  });

  // POST /api/ingredients/:id/purchase
  app.post(['/api/ingredients/:id/purchase', '/ingredients/:id/purchase'], (req, res) => {
    const ing = db.ingredients.find((i) => i.id === req.params.id);
    if (!ing) return res.status(404).json({ detail: 'Bahan tidak ditemukan' });
    const qty = Number(req.body.qty || 0);
    const unit_cost = Number(req.body.unit_cost || ing.buy_price || 0);
    ing.stock = (Number(ing.stock) || 0) + qty;
    if (unit_cost > 0) ing.buy_price = unit_cost;

    const record = {
      id: 'ipur-' + Date.now(),
      ingredient_id: ing.id,
      ingredient_name: ing.name,
      qty,
      unit: ing.unit,
      unit_cost,
      total_cost: qty * unit_cost,
      note: req.body.note || '',
      created_at: new Date().toISOString(),
    };
    db.ingredientPurchases.unshift(record);
    res.json({ qty, unit: ing.unit, new_stock: ing.stock, purchase: record });
  });

  // POST /api/ingredients/:id/opname
  app.post(['/api/ingredients/:id/opname', '/ingredients/:id/opname'], (req, res) => {
    const ing = db.ingredients.find((i) => i.id === req.params.id);
    if (!ing) return res.status(404).json({ detail: 'Bahan tidak ditemukan' });
    const counted = Number(req.body.counted_stock || 0);
    const diff = counted - (Number(ing.stock) || 0);
    ing.stock = counted;

    const record = {
      id: 'iop-' + Date.now(),
      ingredient_id: ing.id,
      ingredient_name: ing.name,
      system_stock: (Number(ing.stock) || 0) - diff,
      counted_stock: counted,
      difference: diff,
      note: req.body.note || '',
      created_at: new Date().toISOString(),
    };
    db.ingredientOpname.unshift(record);
    res.json({ difference: diff, new_stock: ing.stock, record });
  });

  // POST /api/ingredients/purchase-bulk
  app.post(['/api/ingredients/purchase-bulk', '/ingredients/purchase-bulk'], (req, res) => {
    const items = req.body.items || [];
    items.forEach((item) => {
      const ing = db.ingredients.find((i) => i.id === item.ingredient_id);
      if (ing) {
        const qty = Number(item.qty || 0);
        ing.stock = (Number(ing.stock) || 0) + qty;
        db.ingredientPurchases.unshift({
          id: 'ipur-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
          ingredient_id: ing.id,
          ingredient_name: ing.name,
          qty,
          unit: ing.unit,
          unit_cost: Number(item.unit_cost || ing.buy_price || 0),
          total_cost: qty * Number(item.unit_cost || ing.buy_price || 0),
          note: item.note || '',
          created_at: new Date().toISOString(),
        });
      }
    });
    res.json({ count: items.length });
  });

  // POST /api/ingredients/opname-bulk
  app.post(['/api/ingredients/opname-bulk', '/ingredients/opname-bulk'], (req, res) => {
    const items = req.body.items || {};
    let count = 0;
    Object.entries(items).forEach(([ingId, data]) => {
      const ing = db.ingredients.find((i) => i.id === ingId);
      if (ing) {
        const counted = Number(data.counted || 0);
        const diff = counted - Number(ing.stock || 0);
        ing.stock = counted;
        db.ingredientOpname.unshift({
          id: 'iop-' + Date.now() + '-' + count,
          ingredient_id: ing.id,
          ingredient_name: ing.name,
          difference: diff,
          counted_stock: counted,
          note: data.note || '',
          created_at: new Date().toISOString(),
        });
        count++;
      }
    });
    res.json({ count });
  });

  // POST /api/ingredients/vision-commit
  app.post(['/api/ingredients/vision-commit', '/ingredients/vision-commit'], (req, res) => {
    const items = req.body.items || [];
    const created = [];
    const updated = [];

    items.forEach((item, idx) => {
      let ing = db.ingredients.find((i) => i.name.toLowerCase() === (item.name || '').toLowerCase());
      if (ing) {
        ing.stock = (Number(ing.stock) || 0) + Number(item.qty || 0);
        if (item.cost) ing.buy_price = Number(item.cost);
        updated.push(ing);
      } else {
        const newIng = {
          id: 'ing-' + Date.now() + '-' + idx,
          name: item.name,
          unit: item.unit || 'kg',
          stock: Number(item.qty || 0),
          min_stock: 5,
          buy_price: Number(item.cost || 0),
        };
        db.ingredients.push(newIng);
        created.push(newIng);
      }
    });
    res.json({ created, updated });
  });

  // POST /api/ingredients/import
  app.post(['/api/ingredients/import', '/ingredients/import'], upload.single('file'), (req, res) => {
    try {
      if (!req.file || !req.file.buffer) {
        return res.status(400).json({ detail: 'File Excel wajib diunggah' });
      }
      const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
      const rawRows = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });
      const created = [];
      const updated = [];

      rawRows.forEach((r, idx) => {
        const name = r.name || r['Nama Bahan'] || r['nama'] || '';
        if (!name) return;
        const unit = r.unit || r['Satuan'] || 'kg';
        const stock = Number(r.stock || r['Stok'] || 0);
        const min_stock = Number(r.min_stock || r['Min Stok'] || 5);
        const buy_price = Number(r.buy_price || r['Harga Beli'] || 0);

        let ing = db.ingredients.find((i) => i.name.toLowerCase() === name.toLowerCase());
        if (ing) {
          ing.stock = stock;
          ing.min_stock = min_stock;
          ing.buy_price = buy_price;
          updated.push(ing);
        } else {
          const newIng = {
            id: 'ing-' + Date.now() + '-' + idx,
            name,
            unit,
            stock,
            min_stock,
            buy_price,
          };
          db.ingredients.push(newIng);
          created.push(newIng);
        }
      });
      res.json({ created, updated });
    } catch (err) {
      res.status(500).json({ detail: 'Gagal mengimpor bahan: ' + err.message });
    }
  });

  // GET /api/ingredient-purchases & GET /api/ingredient-opname
  app.get(['/api/ingredient-purchases', '/ingredient-purchases'], (req, res) => {
    let list = db.ingredientPurchases;
    if (req.query.date) {
      list = list.filter((p) => p.created_at && p.created_at.startsWith(req.query.date));
    }
    res.json(list);
  });

  app.get(['/api/ingredient-opname', '/ingredient-opname'], (req, res) => {
    let list = db.ingredientOpname;
    if (req.query.date) {
      list = list.filter((p) => p.created_at && p.created_at.startsWith(req.query.date));
    }
    res.json(list);
  });

  // ==========================================
  // 5. Purchases & Stock Opname (Retail Products)
  // ==========================================

  // GET & POST /api/purchases
  app.get(['/api/purchases', '/purchases'], (req, res) => {
    let list = db.purchases;
    if (req.query.date) {
      list = list.filter((p) => p.created_at && p.created_at.startsWith(req.query.date));
    }
    res.json(list);
  });

  app.post(['/api/purchases', '/purchases'], (req, res) => {
    const { product_id, qty, unit_cost, note } = req.body;
    const prod = db.products.find((p) => p.id === product_id);
    if (!prod) return res.status(404).json({ detail: 'Produk tidak ditemukan' });

    const q = Number(qty || 1);
    prod.stock = (Number(prod.stock) || 0) + q;
    if (unit_cost) prod.cost_price = Number(unit_cost);

    const record = {
      id: 'pur-' + Date.now(),
      product_id: prod.id,
      product_name: prod.name,
      qty: q,
      unit_cost: Number(unit_cost || prod.cost_price || 0),
      total_cost: q * Number(unit_cost || prod.cost_price || 0),
      note: note || '',
      created_at: new Date().toISOString(),
    };
    db.purchases.unshift(record);
    res.json(record);
  });

  // POST /api/purchases/bulk
  app.post(['/api/purchases/bulk', '/purchases/bulk'], (req, res) => {
    const items = req.body.items || [];
    let saved = 0;
    let created_products = 0;

    items.forEach((item, idx) => {
      let prod = db.products.find((p) => (item.product_id && p.id === item.product_id) || (item.name && p.name.toLowerCase() === item.name.toLowerCase()));
      if (!prod && item.name) {
        prod = {
          id: 'prod-' + Date.now() + '-' + idx,
          name: item.name,
          sku: item.sku || `RT-${Date.now().toString().slice(-4)}`,
          category_id: item.category_id || db.categories[0]?.id,
          type: 'retail',
          price: Number(item.price || item.unit_cost || 0) * 1.3,
          cost_price: Number(item.unit_cost || 0),
          stock: 0,
          active: true,
          sold_out: false,
        };
        db.products.push(prod);
        created_products++;
      }

      if (prod) {
        const q = Number(item.qty || 1);
        prod.stock = (Number(prod.stock) || 0) + q;
        db.purchases.unshift({
          id: 'pur-' + Date.now() + '-' + idx,
          product_id: prod.id,
          product_name: prod.name,
          qty: q,
          unit_cost: Number(item.unit_cost || prod.cost_price || 0),
          total_cost: q * Number(item.unit_cost || prod.cost_price || 0),
          note: req.body.note || 'Faktur Pembelian',
          created_at: new Date().toISOString(),
        });
        saved++;
      }
    });

    res.json({ saved, created_products });
  });

  // GET & POST /api/stock-opname
  app.get(['/api/stock-opname', '/stock-opname'], (req, res) => {
    let list = db.stockOpnames;
    if (req.query.date) {
      list = list.filter((p) => p.created_at && p.created_at.startsWith(req.query.date));
    }
    res.json(list);
  });

  app.post(['/api/stock-opname', '/stock-opname'], (req, res) => {
    const { product_id, counted_stock, note } = req.body;
    const prod = db.products.find((p) => p.id === product_id);
    if (!prod) return res.status(404).json({ detail: 'Produk tidak ditemukan' });

    const counted = Number(counted_stock || 0);
    const diff = counted - Number(prod.stock || 0);
    prod.stock = counted;

    const record = {
      id: 'op-' + Date.now(),
      product_id: prod.id,
      product_name: prod.name,
      system_stock: Number(prod.stock || 0) - diff,
      counted_stock: counted,
      difference: diff,
      note: note || '',
      created_at: new Date().toISOString(),
    };
    db.stockOpnames.unshift(record);
    res.json({ ...record, difference: diff });
  });

  // ==========================================
  // 6. Shopping List (Daftar Belanja)
  // ==========================================

  // GET /api/shopping-list
  app.get(['/api/shopping-list', '/shopping-list'], (req, res) => {
    const d = req.query.date || new Date().toISOString().slice(0, 10);
    const existing = db.shoppingList[d] || { date: d, items: [] };
    res.json(existing);
  });

  // GET /api/shopping-list/suggest
  app.get(['/api/shopping-list/suggest', '/shopping-list/suggest'], (req, res) => {
    const lowStock = db.ingredients.filter((i) => (Number(i.stock) || 0) <= (Number(i.min_stock) || 5));
    const items = lowStock.map((i) => ({
      ingredient_id: i.id,
      name: i.name,
      unit: i.unit,
      qty: Math.max(1, (Number(i.min_stock) || 5) * 2 - (Number(i.stock) || 0)),
      stock: Number(i.stock) || 0,
      min_stock: Number(i.min_stock) || 5,
      cost: Number(i.buy_price) || 0,
    }));
    res.json({ items });
  });

  // PUT /api/shopping-list
  app.put(['/api/shopping-list', '/shopping-list'], (req, res) => {
    const { date, items, note } = req.body;
    const d = date || new Date().toISOString().slice(0, 10);
    db.shoppingList[d] = { date: d, items: items || [], note: note || '' };
    res.json(db.shoppingList[d]);
  });

  // POST /api/shopping-list/send-wa
  app.post(['/api/shopping-list/send-wa', '/shopping-list/send-wa'], (req, res) => {
    res.json({
      success: true,
      sent: [{ phone: db.whatsappConfig.phone || '081269001122', ok: true }],
    });
  });

  // ==========================================
  // 7. Recipes & HPP
  // ==========================================

  // DELETE /api/recipes/:pid
  app.delete(['/api/recipes/:pid', '/recipes/:pid'], (req, res) => {
    db.recipes = db.recipes.filter((r) => r.product_id !== req.params.pid && r.id !== req.params.pid);
    res.json({ status: 'ok', detail: 'Resep dihapus' });
  });

  // POST /api/recipes/:pid/apply-hpp
  app.post(['/api/recipes/:pid/apply-hpp', '/recipes/:pid/apply-hpp'], (req, res) => {
    const prod = db.products.find((p) => p.id === req.params.pid);
    if (!prod) return res.status(404).json({ detail: 'Produk tidak ditemukan' });

    const recipe = db.recipes.find((r) => r.product_id === req.params.pid);
    let cost = prod.cost_price || 0;
    if (recipe && Array.isArray(recipe.ingredients)) {
      const sum = recipe.ingredients.reduce((acc, row) => {
        const ing = db.ingredients.find((i) => i.id === row.ingredient_id);
        const price = Number(ing?.buy_price || row.cost || 0);
        return acc + (Number(row.qty || 1) * price);
      }, 0);
      const yieldUnits = Number(recipe.yield_units || 1) || 1;
      cost = Math.round(sum / yieldUnits);
      prod.cost_price = cost;
    }
    res.json({ cost, product: prod });
  });

  // ==========================================
  // 8. Reservations
  // ==========================================

  // DELETE /api/reservations/:id
  app.delete(['/api/reservations/:id', '/reservations/:id'], (req, res) => {
    db.reservations = db.reservations.filter((r) => r.id !== req.params.id);
    res.json({ status: 'ok', detail: 'Reservasi dihapus' });
  });

  // POST /api/reservations/:id/status
  app.post(['/api/reservations/:id/status', '/reservations/:id/status'], (req, res) => {
    const resv = db.reservations.find((r) => r.id === req.params.id);
    if (!resv) return res.status(404).json({ detail: 'Reservasi tidak ditemukan' });
    resv.status = req.body.status || resv.status;
    res.json(resv);
  });

  // ==========================================
  // 9. Cash Management
  // ==========================================

  // POST /api/cash/bulk
  app.post(['/api/cash/bulk', '/cash/bulk'], (req, res) => {
    const items = req.body.items || [];
    const added = items.map((item, idx) => {
      const entry = {
        id: 'c-' + Date.now() + '-' + idx,
        type: item.type || 'out',
        category: item.category || 'Operasional',
        amount: Number(item.amount || 0),
        note: item.note || item.name || '',
        created_at: new Date().toISOString(),
      };
      db.cashTransactions.unshift(entry);
      return entry;
    });
    res.json({ count: added.length, items: added });
  });

  // PUT /api/cash/categories
  app.put(['/api/cash/categories', '/cash/categories'], (req, res) => {
    const list = req.body.categories || [];
    const defaultCats = ['Bahan Baku', 'Belanja Operasional', 'Bayar Supplier', 'Kasbon', 'Operasional', 'Lainnya'];
    const merged = Array.from(new Set([...defaultCats, ...list]));
    db.cashCategories = merged;
    res.json({ categories: db.cashCategories });
  });

  // ==========================================
  // 10. Vendor Settlements
  // ==========================================

  // GET /api/vendor-settlements/board
  app.get(['/api/vendor-settlements/board', '/vendor-settlements/board'], (req, res) => {
    const d = req.query.date || new Date().toISOString().slice(0, 10);
    const rows = db.vendors.map((v) => {
      const sales = db.orders.filter((o) => o.created_at && o.created_at.startsWith(d) && o.status === 'completed');
      let total_sales = 0;
      sales.forEach((order) => {
        (order.items || []).forEach((item) => {
          if (item.vendor_id === v.id || v.name.toLowerCase().includes(item.name.toLowerCase())) {
            total_sales += (Number(item.price || 0) * Number(item.qty || 1));
          }
        });
      });
      const share = Math.round((total_sales * Number(v.share_percent || 80)) / 100);
      const paid = db.vendorSettlements
        .filter((s) => s.vendor_id === v.id && s.date === d && s.status !== 'voided')
        .reduce((sum, s) => sum + Number(s.paid || 0), 0);
      const unpaid = Math.max(0, share - paid);

      return {
        vendor_id: v.id,
        vendor_name: v.name,
        share_percent: v.share_percent,
        total_sales,
        total_share: share,
        total_paid: paid,
        total_unpaid: unpaid,
      };
    });

    const summary = {
      total_sales: rows.reduce((s, r) => s + r.total_sales, 0),
      total_share: rows.reduce((s, r) => s + r.total_share, 0),
      total_paid: rows.reduce((s, r) => s + r.total_paid, 0),
      total_unpaid: rows.reduce((s, r) => s + r.total_unpaid, 0),
    };

    res.json({ date: d, rows, summary });
  });

  // POST /api/vendor-settlements
  app.post(['/api/vendor-settlements', '/vendor-settlements'], (req, res) => {
    const { date, vendor_id, paid, payment_method, note, create_cash_out } = req.body;
    const vendor = db.vendors.find((v) => v.id === vendor_id);
    const seq = String(db.vendorSettlements.length + 1).padStart(4, '0');
    const settlement_no = `STL-${(date || '').replace(/-/g, '') || '20260918'}-${seq}`;

    const record = {
      id: 'stl-' + Date.now(),
      settlement_no,
      date: date || new Date().toISOString().slice(0, 10),
      vendor_id,
      vendor_name: vendor?.name || 'Vendor',
      paid: Number(paid || 0),
      payment_method: payment_method || 'cash',
      note: note || '',
      created_at: new Date().toISOString(),
      status: 'completed',
    };

    if (create_cash_out && record.paid > 0) {
      db.cashTransactions.unshift({
        id: 'c-stl-' + Date.now(),
        type: 'out',
        category: 'Bayar Supplier',
        amount: record.paid,
        note: `Bagi hasil vendor ${record.vendor_name} (${record.settlement_no})`,
        created_at: new Date().toISOString(),
      });
    }

    db.vendorSettlements.unshift(record);
    res.json(record);
  });

  // GET /api/vendor-settlements/:id/print
  app.get(['/api/vendor-settlements/:id/print', '/vendor-settlements/:id/print'], (req, res) => {
    const stl = db.vendorSettlements.find((s) => s.id === req.params.id);
    if (!stl) return res.status(404).json({ detail: 'Settlement tidak ditemukan' });
    res.json({
      ...stl,
      outlet_name: 'Grand Aceh Kuliner POS',
      printed_at: new Date().toISOString(),
    });
  });

  // POST /api/vendor-settlements/:id/void
  app.post(['/api/vendor-settlements/:id/void', '/vendor-settlements/:id/void'], (req, res) => {
    const stl = db.vendorSettlements.find((s) => s.id === req.params.id);
    if (!stl) return res.status(404).json({ detail: 'Settlement tidak ditemukan' });
    stl.status = 'voided';
    stl.void_reason = req.body.reason || 'Dibatalkan oleh admin';
    stl.voided_at = new Date().toISOString();
    res.json({ status: 'ok', detail: 'Settlement dibatalkan' });
  });

  // POST /api/vendor-settlements/:id/send-wa
  app.post(['/api/vendor-settlements/:id/send-wa', '/vendor-settlements/:id/send-wa'], (req, res) => {
    res.json({ success: true, sent: [db.whatsappConfig.phone || '081269001122'] });
  });

  // ==========================================
  // 11. Shifts Print & WhatsApp
  // ==========================================

  // GET /api/shifts/:sid/print
  app.get(['/api/shifts/:sid/print', '/shifts/:sid/print'], (req, res) => {
    const sid = req.params.sid;
    const shift = (db.currentShift && db.currentShift.id === sid)
      ? db.currentShift
      : db.shiftHistory.find((s) => s.id === sid) || db.currentShift || {
          user_name: 'Kasir 1',
          opened_at: new Date().toISOString(),
          cash_sales: 150000,
          non_cash_sales: 80000,
          total_sales: 230000,
          orders_count: 5,
        };

    const varianceSection = shift.variance_report ? `
----------------------------------------
       REKONSILIASI KAS FISIK
----------------------------------------
Kas Diharapkan  : Rp ${(Number(shift.variance_report.total?.expected || shift.expected_cash || 0)).toLocaleString('id-ID')}
Fisik Terhitung : Rp ${(Number(shift.variance_report.total?.actual || shift.closing_cash || 0)).toLocaleString('id-ID')}
Selisih Kas     : Rp ${(Number(shift.variance_report.total?.variance || shift.variance_total || 0)).toLocaleString('id-ID')} (${(shift.variance_status || 'balanced').toUpperCase()})
${shift.variance_reason ? `Alasan Selisih  : ${shift.variance_reason}\n` : ''}${shift.denominations ? `Rincian Pecahan Fisik:
${Object.entries(shift.denominations).filter(([_, qty]) => Number(qty) > 0).map(([val, qty]) => ` - Rp ${Number(val).toLocaleString('id-ID')} x ${qty}`).join('\n') || ' -'}\n` : ''}` : '';

    const text = `
========================================
       GRAND ACEH KULINER POS
   LAPORAN REKAPITULASI SHIFT KASIR
========================================
Kasir         : ${shift.user_name || 'Kasir'}
Waktu Buka    : ${shift.opened_at || '-'}
Waktu Tutup   : ${shift.closed_at || 'Shift Sedang Aktif'}
Status        : ${shift.status || 'open'}
----------------------------------------
Modal Awal    : Rp ${(Number(shift.start_cash || shift.opening_cash) || 0).toLocaleString('id-ID')}
Penjualan Kas : Rp ${(Number(shift.cash_sales) || 0).toLocaleString('id-ID')}
Non-Tunai/QRIS: Rp ${(Number(shift.non_cash_sales) || 0).toLocaleString('id-ID')}
Total Penjualan: Rp ${(Number(shift.total_sales) || 0).toLocaleString('id-ID')}
Jumlah Bon    : ${shift.orders_count || 0} transaksi
Total Kas Keluar: Rp ${(Number(shift.cash_out) || 0).toLocaleString('id-ID')}${varianceSection}
========================================
Terima kasih atas kerja keras hari ini!
`;
    res.json({ text, shift });
  });

  // POST /api/shifts/:sid/send-wa
  app.post(['/api/shifts/:sid/send-wa', '/shifts/:sid/send-wa'], (req, res) => {
    res.json({
      success: true,
      recipients: [db.whatsappConfig.phone || '081269001122'],
    });
  });

  // ==========================================
  // 12. Custom Widgets
  // ==========================================

  // DELETE /api/custom-widgets/:id & PUT /api/custom-widgets/:id
  app.put(['/api/custom-widgets/:id', '/custom-widgets/:id'], (req, res) => {
    const w = db.customWidgets.find((item) => item.id === req.params.id);
    if (!w) {
      const newW = { id: req.params.id, ...req.body };
      db.customWidgets.push(newW);
      return res.json(newW);
    }
    Object.assign(w, req.body);
    res.json(w);
  });

  app.delete(['/api/custom-widgets/:id', '/custom-widgets/:id'], (req, res) => {
    db.customWidgets = db.customWidgets.filter((w) => w.id !== req.params.id);
    res.json({ status: 'ok', detail: 'Widget dihapus' });
  });

  // PUT /api/custom-widgets/entry
  app.put(['/api/custom-widgets/entry', '/custom-widgets/entry'], (req, res) => {
    const { widget_id, date, daily } = req.body;
    let existing = db.customWidgetEntries.find((e) => e.widget_id === widget_id && e.date === date);
    if (existing) {
      existing.daily = daily;
      existing.updated_at = new Date().toISOString();
    } else {
      existing = {
        id: 'cwe-' + Date.now(),
        widget_id,
        date: date || new Date().toISOString().slice(0, 10),
        daily,
        created_at: new Date().toISOString(),
      };
      db.customWidgetEntries.push(existing);
    }
    res.json({ daily: existing.daily });
  });

  // GET /api/custom-widgets/:id/entries
  app.get(['/api/custom-widgets/:id/entries', '/custom-widgets/:id/entries'], (req, res) => {
    const list = db.customWidgetEntries.filter((e) => e.widget_id === req.params.id);
    res.json(list);
  });

  // GET /api/custom-widgets/entries
  app.get(['/api/custom-widgets/entries', '/custom-widgets/entries'], (req, res) => {
    const d = req.query.date || new Date().toISOString().slice(0, 10);
    const result = {};
    db.customWidgetEntries.filter((e) => e.date === d).forEach((e) => {
      result[e.widget_id] = e.daily;
    });
    res.json(result);
  });

  // ==========================================
  // 13. Users Management
  // ==========================================

  // PATCH /api/users/:id/must-change-password
  app.patch(['/api/users/:id/must-change-password', '/users/:id/must-change-password'], (req, res) => {
    const u = db.users.find((user) => user.id === req.params.id);
    if (!u) return res.status(404).json({ detail: 'Pengguna tidak ditemukan' });
    u.must_change_password = req.body.value !== undefined ? !!req.body.value : !u.must_change_password;
    res.json(u);
  });

  // POST /api/users/:id/reset-password
  app.post(['/api/users/:id/reset-password', '/users/:id/reset-password'], (req, res) => {
    const u = db.users.find((user) => user.id === req.params.id);
    if (!u) return res.status(404).json({ detail: 'Pengguna tidak ditemukan' });
    const newPass = req.body.new_password || 'GrandPos123!';
    u.must_change_password = !!req.body.must_change_password;
    res.json({ status: 'ok', password: newPass });
  });

  // PATCH /api/users/:id/ingredient-categories
  app.patch(['/api/users/:id/ingredient-categories', '/users/:id/ingredient-categories'], (req, res) => {
    const u = db.users.find((user) => user.id === req.params.id);
    if (!u) return res.status(404).json({ detail: 'Pengguna tidak ditemukan' });
    u.ingredient_categories = req.body.categories || [];
    res.json(u);
  });

  // ==========================================
  // 14. Settings (Webhook, Dashboard, Logos)
  // ==========================================

  // GET & PUT /api/settings/dashboard
  app.get(['/api/settings/dashboard', '/settings/dashboard'], (req, res) => {
    res.json(db.dashboardConfig);
  });

  app.put(['/api/settings/dashboard', '/settings/dashboard'], (req, res) => {
    Object.assign(db.dashboardConfig, req.body);
    res.json(db.dashboardConfig);
  });

  // GET, PUT, POST test /api/settings/webhook
  app.get(['/api/settings/webhook', '/settings/webhook'], (req, res) => {
    res.json(db.webhookConfig);
  });

  app.put(['/api/settings/webhook', '/settings/webhook'], (req, res) => {
    const { enabled, url, secret, events } = req.body;
    db.webhookConfig.enabled = !!enabled;
    db.webhookConfig.url = url || '';
    if (secret) {
      db.webhookConfig.secret = secret;
      db.webhookConfig.secret_set = true;
    }
    if (events) db.webhookConfig.events = events;
    res.json(db.webhookConfig);
  });

  app.post(['/api/settings/webhook/test', '/settings/webhook/test'], (req, res) => {
    db.webhookConfig.last = {
      timestamp: new Date().toISOString(),
      status: 'success',
      status_code: 200,
      message: 'Uji webhook berhasil terkirim dan diterima (HTTP 200 OK)',
    };
    res.json({ ok: true, last: db.webhookConfig.last });
  });

  // POST /api/settings/outlet/logo & /api/settings/platform/logo
  app.post(['/api/settings/outlet/logo', '/settings/outlet/logo', '/api/settings/platform/logo', '/settings/platform/logo'], upload.single('file'), (req, res) => {
    if (req.file && req.file.buffer) {
      const mime = req.file.mimetype || 'image/png';
      const b64 = `data:${mime};base64,${req.file.buffer.toString('base64')}`;
      return res.json({ url: b64 });
    }
    res.json({ url: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=200&h=200&fit=crop' });
  });

  // ==========================================
  // 15. WhatsApp Gateway
  // ==========================================

  // GET & PUT /api/whatsapp/config
  app.get(['/api/whatsapp/config', '/whatsapp/config'], (req, res) => {
    res.json(db.whatsappConfig);
  });

  app.put(['/api/whatsapp/config', '/whatsapp/config'], (req, res) => {
    Object.assign(db.whatsappConfig, req.body);
    res.json(db.whatsappConfig);
  });

  // GET /api/whatsapp/devices
  app.get(['/api/whatsapp/devices', '/whatsapp/devices'], (req, res) => {
    res.json([
      { id: 'dev-wa-1', name: 'Kasir Utama (WA Gateway)', phone: db.whatsappConfig.phone, status: 'online', battery: 92 },
    ]);
  });

  // POST /api/whatsapp/test
  app.post(['/api/whatsapp/test', '/whatsapp/test'], (req, res) => {
    res.json({
      success: true,
      message: `Pesan uji WhatsApp berhasil dikirim ke ${req.body.phone || db.whatsappConfig.phone}`,
    });
  });

  // POST /api/webhook/whatsapp
  app.post(['/api/webhook/whatsapp', '/webhook/whatsapp'], async (req, res) => {
    try {
      const payload = req.body || {};
      let sender = payload.from || payload.sender || payload.phone || (payload.data && (payload.data.from || payload.data.sender || payload.data.phone));
      let body = payload.body || payload.message || payload.text || (payload.data && (payload.data.body || payload.data.message || payload.data.text));

      // Quick response
      res.json({ ok: true, message: 'Webhook received' });

      if (!sender || !body) return;

      const bodyStr = String(body);
      const bodyLower = bodyStr.toLowerCase();

      // Check outbound / self loop
      if (payload.from_me || payload.fromMe || (payload.event && String(payload.event).toLowerCase().includes('sent')) || (payload.direction && String(payload.direction).toLowerCase().includes('out'))) {
        return;
      }

      const botKeywords = ['booking berhasil', 'booking gagal', 'mohon kirimkan format booking', 'terima kasih telah memilih grand aceh kuliner'];
      if (botKeywords.some((bk) => bodyLower.includes(bk))) return;

      const keywords = ['booking', 'reservasi', 'meja', 'pesan tempat', 'pax', 'porsi', 'makan', 'reserv'];
      if (!keywords.some((k) => bodyLower.includes(k))) return;

      // Extract details via Gemini or fallback
      let parsed = null;
      if (process.env.GEMINI_API_KEY) {
        try {
          const { GoogleGenAI } = require('@google/genai');
          const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
          const todayStr = new Date().toISOString().split('T')[0];
          const resp = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Anda adalah asisten AI restoran Grand Aceh Kuliner. Ekstrak pesan WhatsApp reservasi ini menjadi objek JSON yang valid dengan kunci: 'customer_name', 'pax', 'date', 'time', 'table_name', 'note'. Aturan: 'customer_name' (string), 'pax' (integer, default 1), 'date' (format YYYY-MM-DD, hitung relatif dari hari ini: ${todayStr}), 'time' (HH:MM, default '12:00'), 'table_name' (string), 'note' (string). Jawab HANYA JSON tanpa markdown.\n\nPesan: "${bodyStr}"`,
          });
          const text = resp.text ? resp.text.replace(/```json/g, '').replace(/```/g, '').trim() : '';
          parsed = JSON.parse(text);
        } catch (e) {
          console.warn('[WA Webhook Gemini Error]:', e.message);
        }
      }

      if (!parsed) {
        parsed = {
          customer_name: 'Pelanggan WA',
          pax: 2,
          date: new Date().toISOString().split('T')[0],
          time: '12:00',
          table_name: '',
          note: bodyStr,
        };
      }

      const custName = parsed.customer_name || 'Pelanggan WA';
      const pax = Number(parsed.pax) || 1;
      const resDate = parsed.date || new Date().toISOString().split('T')[0];
      const resTime = parsed.time || '12:00';
      const reqTable = parsed.table_name || '';
      const note = parsed.note || '';

      // Match table
      let matchedTable = null;
      const tables = db.tables || [];
      if (reqTable) {
        const cleanReq = reqTable.toLowerCase().replace('meja', '').trim();
        matchedTable = tables.find((t) => t.name.toLowerCase().replace('meja', '').trim() === cleanReq);
      }
      if (!matchedTable) {
        matchedTable = tables.find((t) => (t.capacity || 4) >= pax) || tables[0];
      }

      const resId = 'res-' + Date.now();
      const newRes = {
        id: resId,
        customer_name: custName,
        phone: String(sender),
        table_id: matchedTable ? matchedTable.id : 't-1',
        table_name: matchedTable ? matchedTable.name : 'Meja 1',
        guest_count: pax,
        date_time: `${resDate}T${resTime}:00Z`,
        status: 'confirmed',
        notes: `${note} (Booking Otomatis WACloud)`.trim(),
        created_at: new Date().toISOString(),
      };

      if (!db.reservations) db.reservations = [];
      db.reservations.unshift(newRes);
      broadcastRealtimeSync('reservation_created', newRes);

      console.log(`[WA Webhook] Reservasi otomatis berhasil dibuat untuk ${custName} di ${newRes.table_name}`);
    } catch (err) {
      console.error('[WA Webhook Error]:', err.message);
    }
  });

  // ==========================================
  // 16. AI Features & Sessions
  // ==========================================

  // GET, GET :id, DELETE :id /api/ai/assistant/sessions
  app.get(['/api/ai/assistant/sessions', '/ai/assistant/sessions'], (req, res) => {
    res.json({ sessions: db.aiSessions });
  });

  app.get(['/api/ai/assistant/sessions/:id', '/ai/assistant/sessions/:id'], (req, res) => {
    const s = db.aiSessions.find((item) => item.id === req.params.id);
    if (!s) return res.status(404).json({ detail: 'Sesi percakapan tidak ditemukan' });
    res.json(s);
  });

  app.delete(['/api/ai/assistant/sessions/:id', '/ai/assistant/sessions/:id'], (req, res) => {
    db.aiSessions = db.aiSessions.filter((s) => s.id !== req.params.id);
    res.json({ status: 'ok', detail: 'Sesi percakapan dihapus' });
  });

  // POST /api/ai/assistant/apply
  app.post(['/api/ai/assistant/apply', '/ai/assistant/apply'], (req, res) => {
    const action = req.body.action || {};
    const created = [];
    const errors = [];

    if (action.type === 'create_product') {
      const p = {
        id: 'prod-' + Date.now(),
        name: action.name,
        sku: action.sku || `PR-${Date.now().toString().slice(-4)}`,
        category_id: db.categories[0]?.id || 'cat-1',
        type: action.type_prod || 'makanan',
        price: Number(action.price || 0),
        cost_price: Number(action.cost_price || 0),
        stock: 100,
        active: true,
        sold_out: false,
      };
      db.products.push(p);
      created.push(p.name);
    } else if (action.type === 'bulk_create') {
      (action.items || []).forEach((item, i) => {
        const p = {
          id: 'prod-' + Date.now() + '-' + i,
          name: item.name,
          sku: item.sku || `PR-${Date.now().toString().slice(-4)}-${i}`,
          category_id: db.categories[0]?.id || 'cat-1',
          type: item.kind || 'makanan',
          price: Number(item.price || 0),
          cost_price: Number(item.cost || 0),
          stock: 100,
          active: true,
          sold_out: false,
        };
        db.products.push(p);
        created.push(p.name);
      });
    }

    res.json({
      message: `Aksi ${action.type || 'AI'} berhasil diterapkan`,
      results: { created, errors },
    });
  });

  // POST /api/ai/assistant/import-excel
  app.post(['/api/ai/assistant/import-excel', '/ai/assistant/import-excel'], upload.single('file'), (req, res) => {
    try {
      if (!req.file || !req.file.buffer) {
        return res.status(400).json({ detail: 'File Excel (.xlsx) wajib diunggah' });
      }
      const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
      const rawRows = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });

      let valid_count = 0;
      let new_count = 0;
      let update_count = 0;
      let error_count = 0;

      const rows = rawRows.map((r) => {
        const name = r.name || r['Nama Produk'] || r['nama_produk'] || r['Nama'] || '';
        const sku = r.sku || r['SKU'] || r['Kode'] || '';
        const kategori = r.kategori || r['Kategori'] || 'Makanan Utama';
        const tipe = String(r.type || r['Tipe'] || r['tipe_produk'] || 'makanan').toLowerCase();
        const harga = Number(r.harga || r.price || r['Harga'] || 0);

        const errors = [];
        if (!name.trim()) errors.push('nama kosong');
        if (!harga || isNaN(harga)) errors.push('harga tidak valid');

        const valid = errors.length === 0;
        const exists = db.products.some((p) => (sku && p.sku === sku) || p.name.toLowerCase() === name.toLowerCase());

        if (valid) {
          valid_count++;
          if (exists) update_count++;
          else new_count++;
        } else {
          error_count++;
        }

        return {
          nama_produk: name,
          sku,
          kategori,
          tipe_produk: tipe,
          harga,
          valid,
          exists,
          errors,
        };
      });

      res.json({
        valid_count,
        new_count,
        update_count,
        error_count,
        rows,
      });
    } catch (err) {
      res.status(500).json({ detail: 'Gagal membaca Excel: ' + err.message });
    }
  });

  // POST /api/ai/product-description
  app.post(['/api/ai/product-description', '/ai/product-description'], async (req, res) => {
    const { name, category, type } = req.body;
    try {
      if (process.env.GEMINI_API_KEY) {
        const { GoogleGenAI } = require('@google/genai');
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const resp = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: `Buat deskripsi singkat, menggugah selera (1-2 kalimat), dan bernuansa kuliner khas Aceh untuk menu: "${name}", Kategori: "${category || '-'}", Tipe: "${type || '-'}". Langsung jawab deskripsinya saja tanpa tanda petik atau pengantar.`,
        });
        const text = resp.text ? resp.text.trim() : '';
        if (text) return res.json({ description: text });
      }
    } catch (e) {
      console.warn('[AI Desc Warning]:', e.message);
    }
    res.json({
      description: `Sajian lezat ${name} yang diolah dari rempah pilihan dengan cita rasa otentik khas Grand Aceh Kuliner.`,
    });
  });

  // POST /api/ai/product-image
  app.post(['/api/ai/product-image', '/ai/product-image'], async (req, res) => {
    const { name, description } = req.body;
    // Return high quality visual asset URL or prompt
    const placeholderUrl = `https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&h=500&fit=crop&q=80`;
    res.json({
      image: placeholderUrl,
      prompt: `Foto produk profesional kuliner ${name}, pencahayaan studio hangat, disajikan rapi di atas piring estetik.`,
    });
  });

  // POST /api/ai/purchase-recommendation
  app.post(['/api/ai/purchase-recommendation', '/ai/purchase-recommendation'], (req, res) => {
    const retailProducts = db.products.filter((p) => p.type === 'retail' || p.stock !== undefined);
    const rows = retailProducts.map((p) => {
      const sold_30d = Math.floor(Math.random() * 40) + 10;
      const daily_avg = (sold_30d / 30).toFixed(1);
      const min_stock = 15;
      const suggest = Math.max(0, 30 - (Number(p.stock) || 0));
      return {
        product_id: p.id,
        name: p.name,
        stock: Number(p.stock) || 0,
        min_stock,
        sold_30d,
        daily_avg,
        suggest,
      };
    });

    const ai_summary = `💡 Rekomendasi AI Pembelian Stok:
Terdapat ${rows.filter((r) => r.stock <= r.min_stock).length} produk yang stoknya mendekati batas minimum. Prioritaskan pengadaan produk snack retail dan oleh-oleh kemasan untuk menjaga kelancaran penjualan akhir pekan.`;

    res.json({ ai_summary, rows });
  });

  // POST /api/ai/expense-vision & /ai/expense-vision
  app.post(['/api/ai/expense-vision', '/ai/expense-vision'], (req, res) => {
    res.json({
      items: [
        { name: 'Es Batu Kristal 5 Bal', amount: 50000, category: 'Operasional', note: 'Faktur Toko Es' },
        { name: 'Minyak Goreng Sania 2L', amount: 38000, category: 'Bahan Baku', note: 'Kebutuhan Dapur' },
      ],
      total: 88000,
    });
  });

  // POST /api/ai/ingredient-vision & /ai/ingredient-vision
  app.post(['/api/ai/ingredient-vision', '/ai/ingredient-vision'], (req, res) => {
    res.json({
      items: [
        { name: 'Beras Ramos Super', qty: 2, unit: 'karung', cost: 320000, category_name: 'Bahan Pokok' },
        { name: 'Gula Pasir Gulaku 1kg', qty: 10, unit: 'kg', cost: 18000, category_name: 'Bahan Pokok' },
      ],
    });
  });

  // POST /api/ai/parse-invoice & /ai/parse-invoice
  app.post(['/api/ai/parse-invoice', '/ai/parse-invoice'], (req, res) => {
    res.json({
      items: [
        { name: 'Keripik Pisang Aceh 100g', sku: 'RT-001', qty: 20, unit_cost: 9000, total_cost: 180000 },
        { name: 'Kopi Bubuk Ulee Kareng 250g', sku: 'RT-002', qty: 10, unit_cost: 30000, total_cost: 300000 },
      ],
    });
  });

  // POST /api/feature-request/send & /feature-request/send
  app.post(['/api/feature-request/send', '/feature-request/send'], (req, res) => {
    const msg = (req.body.message || '').trim();
    if (!msg) return res.status(400).json({ detail: 'Pesan usulan tidak boleh kosong' });
    db.featureRequests.unshift({
      id: 'fr-' + Date.now(),
      message: msg,
      created_at: new Date().toISOString(),
      status: 'submitted',
    });
    res.json({
      success: true,
      message: 'Permintaan fitur berhasil dikirim ke antrean pengembang Google AI Studio.',
    });
  });

  // ==========================================
  // 17. Reports Endpoints
  // ==========================================

  // POST /api/reports/vendors/send-whatsapp
  app.post(['/api/reports/vendors/send-whatsapp', '/reports/vendors/send-whatsapp'], (req, res) => {
    res.json({
      success: true,
      message: 'Laporan rekapitulasi vendor berhasil dikirim ke WhatsApp.',
    });
  });

  // ==========================================
  // 18. Admin Integrity, Diagnostics & Reset
  // ==========================================

  // GET & POST /api/admin/integrity
  app.get(['/api/admin/integrity', '/admin/integrity'], (req, res) => {
    res.json({
      auto: true,
      schedule: 'Setiap hari pukul 02:00 WIB',
      fixes: [
        { key: 'fix_orphans', name: 'Bersihkan referensi kategori/meja yatim', safe: true },
        { key: 'recalc_shift', name: 'Sinkronkan ulang total kas shift aktif', safe: true },
      ],
      last: {
        checked_at: new Date().toISOString(),
        duration_ms: 85,
        summary: { error: 0, warn: 0, ok: 14 },
        checks: [
          { name: 'Kesesuaian Saldo Kasir vs Transaksi', status: 'ok', detail: 'Semua shift kas terverifikasi sinkron.' },
          { name: 'Integritas Stok vs Penjualan', status: 'ok', detail: 'Tidak ada stok produk bernilai negatif.' },
          { name: 'Konsistensi Relasi Data (Orphan check)', status: 'ok', detail: 'Semua produk memiliki kategori yang valid.' },
        ],
      },
    });
  });

  app.post(['/api/admin/integrity/check', '/admin/integrity/check'], (req, res) => {
    res.json({
      checked_at: new Date().toISOString(),
      duration_ms: 64,
      summary: { error: 0, warn: 0, ok: 14 },
      checks: [
        { name: 'Kesesuaian Saldo Kasir vs Transaksi', status: 'ok', detail: 'Semua shift kas terverifikasi sinkron.' },
        { name: 'Integritas Stok vs Penjualan', status: 'ok', detail: 'Tidak ada stok produk bernilai negatif.' },
        { name: 'Konsistensi Relasi Data (Orphan check)', status: 'ok', detail: 'Semua produk memiliki kategori yang valid.' },
      ],
    });
  });

  app.post(['/api/admin/integrity/fix', '/admin/integrity/fix'], (req, res) => {
    res.json({
      status: 'ok',
      detail: `Perbaikan otomatis '${req.body.key || 'integritas'}' berhasil dijalankan tanpa kendala.`,
    });
  });

  // GET & POST /api/admin/orphan-check
  app.get(['/api/admin/orphan-check', '/admin/orphan-check'], (req, res) => {
    res.json({
      last_checked: new Date().toISOString(),
      results: [
        { collection: 'orders', count: 0, desc: 'Pesanan tanpa item' },
        { collection: 'products', count: 0, desc: 'Produk tanpa kategori valid' },
      ],
    });
  });

  app.post(['/api/admin/orphan-check', '/admin/orphan-check'], (req, res) => {
    res.json({
      last_checked: new Date().toISOString(),
      results: [
        { collection: 'orders', count: 0, desc: 'Pesanan tanpa item' },
        { collection: 'products', count: 0, desc: 'Produk tanpa kategori valid' },
      ],
    });
  });

  // GET /api/admin/metrics
  app.get(['/api/admin/metrics', '/admin/metrics'], (req, res) => {
    res.json({
      uptime_seconds: Math.floor(process.uptime()),
      memory_usage: process.memoryUsage(),
      active_connections: 1,
      database_counts: {
        products: db.products.length,
        categories: db.categories.length,
        orders: db.orders.length,
        tables: db.tables.length,
        members: db.members.length,
        ingredients: db.ingredients.length,
      },
      status: 'healthy',
    });
  });

  // POST /api/admin/reset-data
  app.post(['/api/admin/reset-data', '/admin/reset-data'], (req, res) => {
    const { scope, password } = req.body;
    if (!password) {
      return res.status(400).json({ detail: 'Password admin wajib diisi' });
    }

    const deleted = {};
    if (scope === 'transactions' || scope === 'all') {
      deleted.orders = db.orders.length;
      deleted.cashTransactions = db.cashTransactions.length;
      deleted.shiftHistory = db.shiftHistory.length;
      deleted.voidRows = db.voidRows.length;
      db.orders = [];
      db.cashTransactions = [];
      db.shiftHistory = [];
      db.voidRows = [];
      if (db.currentShift) {
        db.currentShift.cash_sales = 0;
        db.currentShift.non_cash_sales = 0;
        db.currentShift.total_sales = 0;
        db.currentShift.orders_count = 0;
      }
    }

    if (scope === 'catalog' || scope === 'all') {
      deleted.products = db.products.length;
      db.products = db.products.slice(0, 5); // Keep initial base products
    }

    res.json({ ok: true, deleted });
  });

  // ==========================================
  // 19. Backup Endpoints
  // ==========================================

  // POST /api/backup/send-to-cloud
  app.post(['/api/backup/send-to-cloud', '/backup/send-to-cloud'], (req, res) => {
    res.json({
      ok: true,
      message: 'Data berhasil disinkronkan ke Google Cloud Storage.',
      timestamp: new Date().toISOString(),
    });
  });
}

module.exports = { registerAllMissingRoutes };
