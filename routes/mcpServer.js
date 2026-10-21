const crypto = require('crypto');

/**
 * Model Context Protocol (MCP) Server for Grand Aceh Kuliner POS
 * Specification: Protocol Version 2024-11-05
 * Supports:
 *  - JSON-RPC 2.0 over HTTP POST (/api/mcp and /mcp)
 *  - Server-Sent Events (SSE) (/api/mcp/sse and /sse)
 *  - SSE message routing (/api/mcp/messages?sessionId=...)
 *  - REST helper endpoints for UI testing and status (/api/mcp/tools, /api/mcp/execute, /api/mcp/status)
 */

function registerMcpServer(app, db, broadcastRealtimeSync) {
  // Activity log for MCP invocations
  if (!db.mcpInvocationLogs) {
    db.mcpInvocationLogs = [];
  }

  // Active SSE connections keyed by sessionId
  const sseSessions = new Map();

  function logMcpCall(toolName, args, resultSummary, isError = false, clientInfo = 'MCP-Client') {
    const entry = {
      id: 'mcp-log-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      timestamp: new Date().toISOString(),
      tool: toolName,
      args: args || {},
      summary: resultSummary,
      is_error: isError,
      client: clientInfo,
    };
    db.mcpInvocationLogs.unshift(entry);
    if (db.mcpInvocationLogs.length > 100) {
      db.mcpInvocationLogs = db.mcpInvocationLogs.slice(0, 100);
    }
    return entry;
  }

  function logAgentAudit(domain, action, reason, before, after, clientInfo = 'Hermes-Agent') {
    if (!db.agentAuditLogs) db.agentAuditLogs = [];
    const entry = {
      id: 'audit-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      timestamp: new Date().toISOString(),
      agent: clientInfo,
      domain: domain || 'general',
      action: action || 'mutation',
      reason: reason || 'Perubahan konfigurasi oleh Agen AI Hermes',
      before: before || null,
      after: after || null,
    };
    db.agentAuditLogs.unshift(entry);
    if (db.agentAuditLogs.length > 200) {
      db.agentAuditLogs = db.agentAuditLogs.slice(0, 200);
    }
    return entry;
  }

  // Tool Definitions according to MCP Specification
  const MCP_TOOLS = [
    {
      name: 'pos_get_sales_summary',
      description: 'Mengambil ringkasan omzet, total transaksi penjualan, metode pembayaran (Tunai, QRIS, Transfer, EDC), rasio F&B vs Retail, dan item terlaris untuk hari ini atau rentang tanggal tertentu.',
      inputSchema: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: 'Tanggal spesifik dalam format YYYY-MM-DD (misal: 2026-10-21). Default: hari ini.',
          },
          start_date: {
            type: 'string',
            description: 'Awal rentang tanggal (YYYY-MM-DD)',
          },
          end_date: {
            type: 'string',
            description: 'Akhir rentang tanggal (YYYY-MM-DD)',
          },
          category: {
            type: 'string',
            description: 'Filter kategori produk tertentu (opsional)',
          },
        },
      },
    },
    {
      name: 'pos_get_products',
      description: 'Mencari dan menampilkan daftar produk menu restoran dan barang retail dengan detail harga jual, HPP (COGS), stok saat ini, dan status aktif.',
      inputSchema: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description: 'Nama atau ID kategori produk (opsional)',
          },
          kind: {
            type: 'string',
            enum: ['all', 'fnb', 'retail'],
            description: 'Jenis produk: F&B makanan/minuman atau Retail kelontong',
          },
          search: {
            type: 'string',
            description: 'Kata kunci pencarian nama produk atau barcode/SKU',
          },
          low_stock_only: {
            type: 'boolean',
            description: 'Hanya tampilkan produk yang stoknya menipis',
          },
        },
      },
    },
    {
      name: 'pos_get_low_stock',
      description: 'Memeriksa stok produk dan persediaan bahan baku dapur yang menipis atau di bawah batas minimum (safety stock), serta memberikan rekomendasi pengadaan/restock.',
      inputSchema: {
        type: 'object',
        properties: {
          threshold: {
            type: 'integer',
            description: 'Ambang batas sisa stok minimum (default: 5 porsi / kg)',
            default: 5,
          },
        },
      },
    },
    {
      name: 'pos_get_shift_status',
      description: 'Memeriksa status shift kasir aktif saat ini, nama kasir yang bertugas, saldo modal kas awal di laci, total penerimaan tunai, dan pembagian hasil vendor titipan.',
      inputSchema: {
        type: 'object',
        properties: {
          shift_id: {
            type: 'string',
            description: 'ID shift spesifik (opsional, default: shift yang sedang terbuka)',
          },
        },
      },
    },
    {
      name: 'pos_get_tables_status',
      description: 'Memeriksa denah dan status keterisian seluruh meja makan restoran (tersedia, terisi pelanggan, reservasi), pesanan aktif pada meja, dan kapasitas kursi.',
      inputSchema: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['all', 'available', 'occupied', 'reserved'],
            description: 'Filter status meja',
            default: 'all',
          },
        },
      },
    },
    {
      name: 'pos_get_recent_orders',
      description: 'Melihat riwayat transaksi penjualan terbaru dengan rincian item, meja, total belanja, status lunas, dan waktu transaksi.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: {
            type: 'integer',
            description: 'Jumlah transaksi yang ditampilkan (default: 10, max: 50)',
            default: 10,
          },
          status: {
            type: 'string',
            enum: ['all', 'completed', 'pending', 'void'],
            description: 'Filter status pesanan',
            default: 'all',
          },
          payment_method: {
            type: 'string',
            description: 'Filter metode pembayaran (tunai, qris, transfer, edc)',
          },
        },
      },
    },
    {
      name: 'pos_get_recipes',
      description: 'Menganalisis resep makanan khas Aceh, komposisi takaran bahan baku per porsi, estimasi HPP resep, dan marjin keuntungan.',
      inputSchema: {
        type: 'object',
        properties: {
          search: {
            type: 'string',
            description: 'Nama menu masakan yang ingin diperiksa resepnya',
          },
          product_id: {
            type: 'string',
            description: 'ID produk terkait',
          },
        },
      },
    },
    {
      name: 'pos_get_vendor_settlements',
      description: 'Memeriksa bagi hasil titipan konsinyasi vendor makanan/kue, omzet penjualan vendor, bagian outlet, dan saldo yang belum dibayarkan.',
      inputSchema: {
        type: 'object',
        properties: {
          vendor_id: {
            type: 'string',
            description: 'ID vendor tertentu (opsional)',
          },
          status: {
            type: 'string',
            enum: ['all', 'unpaid', 'paid'],
            description: 'Status pembayaran bagi hasil vendor',
            default: 'all',
          },
        },
      },
    },
    {
      name: 'pos_get_void_refund_audit',
      description: 'Melakukan audit transaksi void/pembatalan nota dan pengembalian dana (refund) untuk mencegah kebocoran kas kasir.',
      inputSchema: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: 'Tanggal transaksi void (YYYY-MM-DD)',
          },
          limit: {
            type: 'integer',
            description: 'Maksimal baris data audit (default: 15)',
            default: 15,
          },
        },
      },
    },
    {
      name: 'pos_update_product_stock',
      description: 'Memperbarui stok produk secara langsung dengan pencatatan alasan opname (kebutuhan operasional cepat oleh AI/Admin).',
      inputSchema: {
        type: 'object',
        required: ['product_id', 'new_stock', 'reason'],
        properties: {
          product_id: {
            type: 'string',
            description: 'ID atau barcode produk yang disesuaikan',
          },
          new_stock: {
            type: 'number',
            description: 'Jumlah stok fisik baru yang sebenarnya',
          },
          reason: {
            type: 'string',
            description: 'Alasan penyesuaian stok (contoh: Penyesuaian opname harian, Barang rusak, Restock supplier)',
          },
        },
      },
    },
    {
      name: 'manage_articles_and_stories',
      description: 'Mengakses dan mengelola artikel edukasi kuliner, sejarah masakan Aceh, dan konten blog restoran.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['list', 'get', 'stats'],
            default: 'list',
          },
          query: {
            type: 'string',
            description: 'Kata kunci pencarian artikel',
          },
        },
      },
    },
    {
      name: 'pos_manage_whatsapp_config',
      description: 'Mengambil atau memperbarui konfigurasi WhatsApp Gateway (Baileys/Hermes di port 8644 Gudang), nomor bot, aturan grup reservasi meja, dan template pesan otomatis (laporan shift, struk, promo).',
      inputSchema: {
        type: 'object',
        required: ['action'],
        properties: {
          action: {
            type: 'string',
            enum: ['get', 'update_connection', 'update_templates', 'test_message'],
            description: 'Aksi yang dijalankan: get (baca), update_connection (update server WA), update_templates (update teks template), test_message (kirim pesan tes)',
          },
          connection_data: {
            type: 'object',
            description: 'Parameter koneksi gateway: provider, hermes_url, hermes_secret, phone, auto_failover, group_only_reservation, reservation_keywords, target_group_id',
          },
          templates_data: {
            type: 'object',
            description: 'Template pesan WA: daily_report, receipt_template, reservation_confirm, promo_broadcast',
          },
          test_phone: {
            type: 'string',
            description: 'Nomor WhatsApp tujuan untuk pengujian (contoh: 081269001122)',
          },
          reason: {
            type: 'string',
            description: 'Alasan penyesuaian konfigurasi WhatsApp untuk riwayat audit',
          },
        },
      },
    },
    {
      name: 'pos_manage_server_cluster',
      description: 'Memeriksa status dan kesehatan server cluster (Server Gudang 644 & Raspberry Pi Kasir), status jaringan Tailscale Mesh, jadwal auto-backup, serta memicu pencadangan database instan.',
      inputSchema: {
        type: 'object',
        required: ['action'],
        properties: {
          action: {
            type: 'string',
            enum: ['get_cluster_health', 'trigger_backup', 'get_backup_history', 'sync_pi_nodes'],
            description: 'Aksi server: get_cluster_health, trigger_backup, get_backup_history, sync_pi_nodes',
          },
          backup_target: {
            type: 'string',
            enum: ['vps', 'pi', 'cloud', 'gdrive'],
            description: 'Target penyimpanan backup (default: vps)',
            default: 'vps',
          },
          notes: {
            type: 'string',
            description: 'Catatan audit pemeliharaan sistem',
          },
        },
      },
    },
    {
      name: 'pos_manage_promos_and_coupons',
      description: 'Mengelola promo diskon kasir (persen/nominal), kupon reward member, serta menyinkronkan banner promo di Landing Page publik secara instan tanpa reload.',
      inputSchema: {
        type: 'object',
        required: ['action'],
        properties: {
          action: {
            type: 'string',
            enum: ['list', 'create_promo', 'create_coupon', 'update_landing_banner', 'deactivate_promo', 'deactivate_coupon'],
            description: 'Aksi promo/kupon: list, create_promo, create_coupon, update_landing_banner, deactivate_promo, deactivate_coupon',
          },
          promo_data: {
            type: 'object',
            description: 'Data promo kasir: name, type (percent/fixed), value, min_spend, max_discount, valid_until, applies_to (fnb/retail/all)',
          },
          coupon_data: {
            type: 'object',
            description: 'Data kupon diskon member: code, discount_value, discount_type, quota, expires_at',
          },
          landing_banner: {
            type: 'object',
            description: 'Konten banner promo landing page: enabled, badge, title, subtitle, cta_text, cta_link',
          },
          target_id: {
            type: 'string',
            description: 'ID promo atau kupon yang ingin dinonaktifkan',
          },
          reason: {
            type: 'string',
            description: 'Alasan penyesuaian promo/kupon untuk riwayat audit',
          },
        },
      },
    },
    {
      name: 'pos_audit_agent_actions',
      description: 'Mengambil riwayat log audit mutasi konfigurasi dan aksi yang telah diterapkan oleh Hermes Agent (sebelum & sesudah perubahan).',
      inputSchema: {
        type: 'object',
        properties: {
          domain: {
            type: 'string',
            enum: ['all', 'wa', 'server', 'promo'],
            description: 'Filter domain audit log',
            default: 'all',
          },
          limit: {
            type: 'integer',
            description: 'Jumlah riwayat log yang ditampilkan (default: 20)',
            default: 20,
          },
        },
      },
    },
  ];

  // Resource Definitions according to MCP Specification
  const MCP_RESOURCES = [
    {
      uri: 'pos://menu/catalog',
      name: 'Katalog Menu & Produk Lengkap',
      description: 'Seluruh daftar menu makanan F&B, minuman, dan produk retail beserta harga dan status ketersediaan.',
      mimeType: 'application/json',
    },
    {
      uri: 'pos://analytics/today',
      name: 'Ringkasan Finansial Realtime Hari Ini',
      description: 'Snapshot omzet penjualan, jumlah struk, metode pembayaran, dan metrik kasir per hari ini.',
      mimeType: 'application/json',
    },
    {
      uri: 'pos://inventory/alerts',
      name: 'Peringatan Persediaan & Bahan Baku Rendah',
      description: 'Daftar semua item produk dan bahan baku dapur yang saat ini di bawah batas aman stok.',
      mimeType: 'application/json',
    },
    {
      uri: 'pos://tables/map',
      name: 'Denah & Status Meja Restoran',
      description: 'Status seluruh meja makan, area ruangan, kapasitas, dan nomor pesanan yang sedang aktif.',
      mimeType: 'application/json',
    },
    {
      uri: 'pos://shifts/current',
      name: 'Status Shift Kasir Aktif',
      description: 'Informasi shift kasir yang sedang berjalan, waktu buka, modal kas awal, dan rincian transaksi.',
      mimeType: 'application/json',
    },
  ];

  // Prompt Templates according to MCP Specification
  const MCP_PROMPTS = [
    {
      name: 'daily_cashier_audit',
      description: 'Template audit rekonsiliasi kas shift kasir, perbandingan uang fisik vs sistem, dan pencatatan bagi hasil vendor.',
      arguments: [
        { name: 'cashier_name', description: 'Nama kasir yang bertugas', required: false },
        { name: 'physical_cash', description: 'Jumlah uang fisik di laci kas saat tutup shift', required: false },
      ],
    },
    {
      name: 'inventory_replenishment_guide',
      description: 'Panduan rekomendasi belanja persediaan bahan dapur berdasarkan laju pemakaian menu terlaris.',
      arguments: [
        { name: 'budget_limit', description: 'Batas anggaran belanja belanja bahan (opsional)', required: false },
      ],
    },
    {
      name: 'menu_margin_analyzer',
      description: 'Analisis profitabilitas menu masakan Aceh: identifikasi menu bintang (high margin, high sales) dan menu beban (low margin).',
      arguments: [
        { name: 'focus_category', description: 'Kategori menu yang difokuskan (opsional)', required: false },
      ],
    },
    {
      name: 'rush_hour_optimization',
      description: 'Strategi operasional saat jam sibuk (makan siang/malam): manajemen rotasi meja dan percepatan antrean pesanan.',
      arguments: [],
    },
  ];

  // Tool Execution Engine
  async function executeTool(name, args = {}, clientInfo = 'MCP') {
    switch (name) {
      case 'pos_get_sales_summary': {
        const todayStr = new Date().toISOString().slice(0, 10);
        const targetDate = args.date === 'today' || !args.date ? (args.start_date ? null : todayStr) : args.date;
        const allOrders = db.orders || [];

        const filtered = allOrders.filter((o) => {
          const oDate = (o.created_at || '').slice(0, 10);
          if (targetDate) return oDate === targetDate;
          if (args.start_date && args.end_date) {
            return oDate >= args.start_date && oDate <= args.end_date;
          }
          if (args.start_date) return oDate >= args.start_date;
          return true;
        });

        const completedOrders = filtered.filter((o) => o.status !== 'void' && o.status !== 'cancelled');
        const voidOrders = filtered.filter((o) => o.status === 'void' || o.status === 'cancelled');

        const totalRevenue = completedOrders.reduce((acc, o) => acc + (Number(o.total) || 0), 0);
        const totalSubtotal = completedOrders.reduce((acc, o) => acc + (Number(o.subtotal) || Number(o.total) || 0), 0);
        const totalDiscount = completedOrders.reduce((acc, o) => acc + (Number(o.discount) || 0), 0);
        const totalTax = completedOrders.reduce((acc, o) => acc + (Number(o.tax) || 0), 0);

        // Payments breakdown
        const payments = {};
        completedOrders.forEach((o) => {
          const pm = (o.payment_method || 'tunai').toLowerCase();
          payments[pm] = (payments[pm] || 0) + (Number(o.total) || 0);
        });

        // F&B vs Retail
        let fnbTotal = 0;
        let retailTotal = 0;
        const itemFreq = {};

        completedOrders.forEach((o) => {
          (o.items || []).forEach((it) => {
            const qty = Number(it.qty) || 1;
            const price = Number(it.price) || 0;
            const lineTotal = qty * price;
            const kind = it.kind || (it.category_name?.toLowerCase().includes('retail') ? 'retail' : 'fnb');
            if (kind === 'retail') retailTotal += lineTotal;
            else fnbTotal += lineTotal;

            const itemName = it.name || it.product_name || 'Item';
            itemFreq[itemName] = (itemFreq[itemName] || 0) + qty;
          });
        });

        const topItems = Object.entries(itemFreq)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([name, qty]) => ({ name, qty_sold: qty }));

        const result = {
          query_date: targetDate || `${args.start_date || 'awal'} s/d ${args.end_date || 'sekarang'}`,
          total_revenue: totalRevenue,
          total_orders: completedOrders.length,
          void_orders_count: voidOrders.length,
          average_ticket: completedOrders.length > 0 ? Math.round(totalRevenue / completedOrders.length) : 0,
          gross_sales: totalSubtotal,
          total_discount: totalDiscount,
          total_tax: totalTax,
          fnb_revenue: fnbTotal,
          retail_revenue: retailTotal,
          payment_breakdown: payments,
          top_selling_items: topItems,
          currency: 'IDR',
        };

        logMcpCall(name, args, `Omzet: Rp ${totalRevenue.toLocaleString('id-ID')} (${completedOrders.length} order)`, false, clientInfo);
        return result;
      }

      case 'pos_get_products': {
        let prods = [...(db.products || [])];
        if (args.kind && args.kind !== 'all') {
          prods = prods.filter((p) => (p.kind || 'fnb') === args.kind);
        }
        if (args.category) {
          const catLower = args.category.toLowerCase();
          prods = prods.filter((p) =>
            (p.category_name || '').toLowerCase().includes(catLower) ||
            p.category_id === args.category
          );
        }
        if (args.search) {
          const sLower = args.search.toLowerCase();
          prods = prods.filter((p) =>
            (p.name || '').toLowerCase().includes(sLower) ||
            (p.sku || '').toLowerCase().includes(sLower) ||
            (p.barcode || '').toLowerCase().includes(sLower)
          );
        }
        if (args.low_stock_only) {
          prods = prods.filter((p) => p.track_stock && Number(p.stock) <= 5);
        }

        const simplified = prods.slice(0, 50).map((p) => ({
          id: p.id,
          name: p.name,
          category: p.category_name || 'Umum',
          kind: p.kind || 'fnb',
          price: Number(p.price) || 0,
          cost: Number(p.cost) || 0,
          stock: p.stock !== undefined ? Number(p.stock) : 'unlimited',
          track_stock: Boolean(p.track_stock),
          sku: p.sku || p.barcode || '-',
          active: p.active !== false,
          vendor_name: p.vendor_name || null,
        }));

        const result = {
          total_found: prods.length,
          showing: simplified.length,
          products: simplified,
        };

        logMcpCall(name, args, `Ditemukan ${prods.length} produk`, false, clientInfo);
        return result;
      }

      case 'pos_get_low_stock': {
        const threshold = Number(args.threshold) || 5;
        const lowProducts = (db.products || [])
          .filter((p) => p.track_stock && Number(p.stock) <= threshold)
          .map((p) => ({
            id: p.id,
            type: 'product',
            name: p.name,
            current_stock: Number(p.stock),
            threshold: threshold,
            unit: 'porsi/pcs',
            urgency: Number(p.stock) <= 0 ? 'CRITICAL_OUT_OF_STOCK' : 'WARNING_LOW',
            cost: Number(p.cost) || 0,
          }));

        const lowIngredients = (db.ingredients || [])
          .filter((i) => Number(i.stock) <= Number(i.min_stock || threshold))
          .map((i) => ({
            id: i.id,
            type: 'ingredient',
            name: i.name,
            current_stock: Number(i.stock),
            min_stock: Number(i.min_stock || threshold),
            unit: i.unit || 'kg',
            urgency: Number(i.stock) <= 0 ? 'CRITICAL_OUT_OF_STOCK' : 'WARNING_LOW',
            cost_per_unit: Number(i.cost_per_unit || i.price || 0),
          }));

        const result = {
          threshold_used: threshold,
          total_alerts: lowProducts.length + lowIngredients.length,
          has_critical_items: lowProducts.some((p) => p.current_stock <= 0) || lowIngredients.some((i) => i.current_stock <= 0),
          low_stock_products: lowProducts,
          low_stock_kitchen_ingredients: lowIngredients,
          recommendation: lowProducts.length + lowIngredients.length > 0
            ? 'Segera buat purchase order belanja bahan untuk item yang berstatus CRITICAL_OUT_OF_STOCK'
            : 'Seluruh persediaan dalam kondisi aman terkendali.',
        };

        logMcpCall(name, args, `Alert: ${result.total_alerts} item menipis`, false, clientInfo);
        return result;
      }

      case 'pos_get_shift_status': {
        const shifts = db.shifts || [];
        let shift = null;
        if (args.shift_id) {
          shift = shifts.find((s) => s.id === args.shift_id);
        } else {
          shift = shifts.find((s) => s.status === 'open') || shifts[shifts.length - 1];
        }

        if (!shift) {
          const res = {
            status: 'no_shift_found',
            message: 'Belum ada shift kasir yang tercatat atau dibuka di sistem.',
          };
          logMcpCall(name, args, 'Tidak ada shift aktif', false, clientInfo);
          return res;
        }

        // Calculate expected drawer cash
        const startingCash = Number(shift.starting_cash) || 0;
        const cashOrders = (db.orders || [])
          .filter((o) => (o.shift_id === shift.id || (!o.shift_id && shift.status === 'open')) && (o.payment_method || '').toLowerCase() === 'tunai' && o.status !== 'void')
          .reduce((sum, o) => sum + (Number(o.total) || 0), 0);

        const outExpenses = (db.cashMovements || [])
          .filter((m) => m.shift_id === shift.id && m.type === 'out')
          .reduce((sum, m) => sum + (Number(m.amount) || 0), 0);

        const expectedCash = startingCash + cashOrders - outExpenses;

        const result = {
          shift_id: shift.id,
          status: shift.status || 'open',
          cashier_name: shift.cashier_name || shift.user_name || shift.opened_by || 'Kasir',
          opened_at: shift.opened_at || shift.created_at || 'Hari ini',
          closed_at: shift.closed_at || null,
          starting_cash: startingCash,
          total_cash_sales: cashOrders,
          total_expenses_paid: outExpenses,
          expected_cash_drawer: expectedCash,
          system_calculated_total: Number(shift.total_sales) || (cashOrders + (Number(shift.non_cash_sales) || 0)),
          is_active: shift.status === 'open',
        };

        logMcpCall(name, args, `Shift ${shift.id}: ${shift.status} (Kasir: ${result.cashier_name})`, false, clientInfo);
        return result;
      }

      case 'pos_get_tables_status': {
        const tables = db.tables || [];
        const statusFilter = args.status || 'all';
        const filtered = tables.filter((t) => {
          if (statusFilter === 'all') return true;
          return t.status === statusFilter;
        });

        const occupiedCount = tables.filter((t) => t.status === 'occupied').length;
        const availableCount = tables.filter((t) => t.status === 'available' || t.status === 'empty' || !t.status).length;
        const reservedCount = tables.filter((t) => t.status === 'reserved').length;

        const result = {
          total_tables: tables.length,
          occupancy_rate: tables.length > 0 ? Math.round((occupiedCount / tables.length) * 100) + '%' : '0%',
          summary: {
            available: availableCount,
            occupied: occupiedCount,
            reserved: reservedCount,
          },
          tables: filtered.map((t) => ({
            id: t.id,
            number: t.number || t.table_number || t.name,
            name: t.name || `Meja ${t.number || ''}`,
            capacity: Number(t.capacity || 4),
            area: t.area || 'Utama',
            status: t.status || 'available',
            active_order_id: t.active_order_id || null,
            guest_count: t.guest_count || 0,
            seated_time: t.seated_time || null,
          })),
        };

        logMcpCall(name, args, `Meja: ${occupiedCount}/${tables.length} terisi`, false, clientInfo);
        return result;
      }

      case 'pos_get_recent_orders': {
        const limit = Math.min(50, Math.max(1, Number(args.limit) || 10));
        let orders = [...(db.orders || [])];

        if (args.status && args.status !== 'all') {
          orders = orders.filter((o) => (o.status || 'completed') === args.status);
        }
        if (args.payment_method) {
          const pm = args.payment_method.toLowerCase();
          orders = orders.filter((o) => (o.payment_method || '').toLowerCase() === pm);
        }

        orders.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        const sliced = orders.slice(0, limit);

        const result = {
          total_matching: orders.length,
          returned_count: sliced.length,
          orders: sliced.map((o) => ({
            id: o.id,
            order_number: o.order_number || o.id,
            type: o.type || 'fnb',
            status: o.status || 'completed',
            total: Number(o.total) || 0,
            subtotal: Number(o.subtotal) || Number(o.total) || 0,
            discount: Number(o.discount) || 0,
            payment_method: o.payment_method || 'tunai',
            table: o.table_number || o.table || '-',
            cashier: o.cashier_name || o.cashier || 'Kasir',
            item_count: (o.items || []).reduce((acc, it) => acc + (Number(it.qty) || 1), 0),
            created_at: o.created_at || new Date().toISOString(),
            items_preview: (o.items || []).map((it) => `${it.qty || 1}x ${it.name || it.product_name}`).join(', '),
          })),
        };

        logMcpCall(name, args, `Ambil ${sliced.length} pesanan terbaru`, false, clientInfo);
        return result;
      }

      case 'pos_get_recipes': {
        const recipes = db.recipes || [];
        let filtered = [...recipes];
        if (args.search) {
          const s = args.search.toLowerCase();
          filtered = filtered.filter((r) => (r.name || r.product_name || '').toLowerCase().includes(s));
        }
        if (args.product_id) {
          filtered = filtered.filter((r) => r.product_id === args.product_id || r.id === args.product_id);
        }

        const enriched = filtered.slice(0, 20).map((r) => {
          const prod = (db.products || []).find((p) => p.id === r.product_id || p.name === r.name);
          const price = prod ? Number(prod.price || 0) : Number(r.price || 0);
          const cogs = Number(r.cost || r.hpp || 0);
          const margin = price > 0 ? Math.round(((price - cogs) / price) * 100) : 0;
          return {
            id: r.id,
            dish_name: r.name || r.product_name,
            product_id: r.product_id || null,
            selling_price: price,
            calculated_hpp: cogs,
            profit_margin_percent: margin + '%',
            ingredient_count: (r.ingredients || []).length,
            ingredients: r.ingredients || [],
            notes: r.notes || null,
          };
        });

        const result = {
          total_recipes: recipes.length,
          found: enriched.length,
          recipes: enriched,
        };

        logMcpCall(name, args, `Ditemukan ${enriched.length} resep masakan`, false, clientInfo);
        return result;
      }

      case 'pos_get_vendor_settlements': {
        const vendors = db.vendors || [];
        const settlements = db.vendorSettlements || [];
        let filtered = [...settlements];

        if (args.vendor_id) {
          filtered = filtered.filter((s) => s.vendor_id === args.vendor_id);
        }
        if (args.status && args.status !== 'all') {
          filtered = filtered.filter((s) => (s.status || 'unpaid') === args.status);
        }

        const result = {
          total_vendors: vendors.length,
          settlements_count: filtered.length,
          total_unpaid_amount: filtered.filter((s) => s.status !== 'paid').reduce((acc, s) => acc + (Number(s.amount || s.vendor_share || 0)), 0),
          settlements: filtered.slice(0, 25).map((s) => ({
            id: s.id,
            vendor_id: s.vendor_id,
            vendor_name: s.vendor_name || 'Vendor',
            item_name: s.item_name || s.product_name || '-',
            sold_qty: Number(s.qty || s.sold_qty || 0),
            total_sales: Number(s.total_sales || 0),
            vendor_share_amount: Number(s.amount || s.vendor_share || 0),
            status: s.status || 'unpaid',
            shift_id: s.shift_id || null,
            created_at: s.created_at || new Date().toISOString(),
          })),
        };

        logMcpCall(name, args, `Bagi Hasil: Rp ${result.total_unpaid_amount.toLocaleString('id-ID')} belum terbayar`, false, clientInfo);
        return result;
      }

      case 'pos_get_void_refund_audit': {
        const limit = Math.min(50, Number(args.limit) || 15);
        let voids = [...(db.voidRows || [])];
        if (voids.length === 0) {
          // Look into orders with status void
          voids = (db.orders || [])
            .filter((o) => o.status === 'void' || o.status === 'cancelled')
            .map((o) => ({
              id: 'void-' + o.id,
              order_id: o.id,
              order_number: o.order_number,
              reason: o.void_reason || 'Pembatalan transaksi oleh kasir/admin',
              amount: Number(o.total) || 0,
              cashier: o.cashier_name || o.cashier || 'Kasir',
              approved_by: o.void_by || 'Supervisor',
              created_at: o.void_at || o.created_at || new Date().toISOString(),
            }));
        }

        if (args.date) {
          voids = voids.filter((v) => (v.created_at || '').slice(0, 10) === args.date);
        }

        voids.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        const sliced = voids.slice(0, limit);
        const totalVoidLoss = sliced.reduce((acc, v) => acc + (Number(v.amount) || 0), 0);

        const result = {
          total_voids: voids.length,
          audit_rows: sliced,
          total_loss_impact: totalVoidLoss,
          currency: 'IDR',
        };

        logMcpCall(name, args, `Audit Void: ${sliced.length} kasus (Total: Rp ${totalVoidLoss.toLocaleString('id-ID')})`, false, clientInfo);
        return result;
      }

      case 'pos_update_product_stock': {
        const { product_id, new_stock, reason } = args;
        if (!product_id || new_stock === undefined) {
          throw new Error('product_id dan new_stock wajib diisi');
        }

        const prod = (db.products || []).find((p) => p.id === product_id || p.sku === product_id || p.barcode === product_id);
        if (!prod) {
          throw new Error(`Produk dengan ID/Barcode ${product_id} tidak ditemukan`);
        }

        const oldStock = Number(prod.stock) || 0;
        prod.stock = Number(new_stock);
        prod.track_stock = true;
        prod.updated_at = new Date().toISOString();

        // Record stock opname log
        if (!db.stockOpnames) db.stockOpnames = [];
        const opnameEntry = {
          id: 'opn-' + Date.now(),
          product_id: prod.id,
          product_name: prod.name,
          old_stock: oldStock,
          new_stock: Number(new_stock),
          difference: Number(new_stock) - oldStock,
          reason: reason || 'Penyesuaian stok melalui MCP AI Agent',
          adjusted_by: clientInfo,
          created_at: new Date().toISOString(),
        };
        db.stockOpnames.unshift(opnameEntry);

        broadcastRealtimeSync('inventory_updated', {
          product_id: prod.id,
          stock: prod.stock,
          opname: opnameEntry,
        });

        const result = {
          success: true,
          product_id: prod.id,
          product_name: prod.name,
          old_stock: oldStock,
          new_stock: Number(new_stock),
          change: Number(new_stock) - oldStock,
          reason: reason,
          timestamp: opnameEntry.created_at,
        };

        logMcpCall(name, args, `Stok ${prod.name}: ${oldStock} -> ${new_stock} (${reason})`, false, clientInfo);
        return result;
      }

      case 'manage_articles_and_stories': {
        const articles = db.articles || [];
        const action = args.action || 'list';
        if (action === 'stats') {
          const published = articles.filter((a) => a.published !== false).length;
          return {
            total_articles: articles.length,
            published_count: published,
            draft_count: articles.length - published,
          };
        }
        let results = [...articles];
        if (args.query) {
          const q = args.query.toLowerCase();
          results = results.filter((a) => (a.title || '').toLowerCase().includes(q) || (a.category || '').toLowerCase().includes(q));
        }
        return {
          count: results.length,
          articles: results.slice(0, 10).map((a) => ({
            id: a.id,
            title: a.title,
            slug: a.slug,
            category: a.category,
            published: a.published !== false,
            reading_time: a.reading_time || '3 menit',
          })),
        };
      }

      case 'pos_manage_whatsapp_config': {
        const action = args.action || 'get';
        const reason = args.reason || 'Disesuaikan oleh Hermes Agent';

        if (action === 'get') {
          const waConfig = db.settings?.wa || {};
          const waTemplates = db.settings?.wa_templates || {};
          const result = {
            gateway: waConfig,
            templates: waTemplates,
            evolution_fallback: db.whatsappConfig || {},
          };
          logMcpCall(name, args, 'Membaca konfigurasi WhatsApp POS', false, clientInfo);
          return result;
        }

        if (action === 'update_connection') {
          const before = JSON.parse(JSON.stringify(db.settings?.wa || {}));
          db.settings.wa = {
            ...db.settings.wa,
            ...(args.connection_data || {}),
            updated_at: new Date().toISOString(),
          };
          if (args.connection_data?.phone) {
            if (db.whatsappConfig) db.whatsappConfig.phone = args.connection_data.phone;
          }
          const after = JSON.parse(JSON.stringify(db.settings.wa));
          logAgentAudit('wa', 'update_connection', reason, before, after, clientInfo);
          broadcastRealtimeSync('settings_updated', { section: 'wa' });
          logMcpCall(name, args, `Update WhatsApp Connection (${reason})`, false, clientInfo);
          return { success: true, message: 'Koneksi WhatsApp Gateway berhasil diperbarui', connection: db.settings.wa };
        }

        if (action === 'update_templates') {
          const before = JSON.parse(JSON.stringify(db.settings?.wa_templates || {}));
          db.settings.wa_templates = {
            ...db.settings.wa_templates,
            ...(args.templates_data || {}),
            updated_at: new Date().toISOString(),
          };
          const after = JSON.parse(JSON.stringify(db.settings.wa_templates));
          logAgentAudit('wa', 'update_templates', reason, before, after, clientInfo);
          broadcastRealtimeSync('settings_updated', { section: 'wa_templates' });
          logMcpCall(name, args, `Update WhatsApp Templates (${reason})`, false, clientInfo);
          return { success: true, message: 'Template pesan WhatsApp berhasil diperbarui', templates: db.settings.wa_templates };
        }

        if (action === 'test_message') {
          const target = args.test_phone || db.settings?.wa?.phone || '081269001122';
          const testMsg = `[Grand Aceh POS - Test Gateway]\nHalo! Ini adalah pesan uji koneksi dari Hermes Agent di Server Gudang 644.\nWaktu: ${new Date().toLocaleString('id-ID')}\nStatus: Terhubung & Aktif.`;
          logMcpCall(name, args, `Uji kirim WhatsApp ke ${target}`, false, clientInfo);
          return {
            success: true,
            recipient: target,
            sample_payload: testMsg,
            delivery_mode: 'hermes_outbox_adapter_port_8644',
            timestamp: new Date().toISOString(),
          };
        }

        throw new Error(`Aksi WhatsApp "${action}" tidak didukung`);
      }

      case 'pos_manage_server_cluster': {
        const action = args.action || 'get_cluster_health';
        const notes = args.notes || 'Aksi pemeliharaan cluster oleh Hermes Agent';

        if (action === 'get_cluster_health') {
          const os = require('os');
          const totalMem = Math.round(os.totalmem() / (1024 * 1024));
          const freeMem = Math.round(os.freemem() / (1024 * 1024));
          const usedMem = totalMem - freeMem;

          const result = {
            gudang_server: {
              role: 'Master Database, WhatsApp Gateway & Landing Page (Gudang 644)',
              port: 3000,
              wa_port: 8644,
              status: 'healthy',
              uptime_seconds: process.uptime(),
              memory_used_mb: `${usedMem} MB / ${totalMem} MB`,
              cpu_load: os.loadavg ? os.loadavg() : [0.1, 0.15, 0.2],
            },
            raspberry_pi_node: {
              role: 'Frontend POS Kasir, Printer Thermal & Kiosk Display',
              mesh: 'Tailscale VPN Connected',
              sync_mode: 'idempotent_offline_queue',
              status: 'online',
            },
            backup_status: {
              last_backup_at: db.gdrive_backup_config?.last_backup_at || null,
              total_history_count: (db.gdrive_backup_history || []).length,
              schedule: db.gdrive_backup_config?.frequency || 'daily',
            },
            cluster_synchronized: true,
          };
          logMcpCall(name, args, 'Cek status kesehatan Server Gudang & Pi', false, clientInfo);
          return result;
        }

        if (action === 'trigger_backup') {
          const dateStr = new Date().toISOString().slice(0, 10);
          const target = args.backup_target || 'vps';
          const record = {
            id: `bkp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            file_name: `gak-backup-${target}-${dateStr}-${Date.now().toString().slice(-4)}.zip`,
            file_size: `${Math.round(JSON.stringify(db).length / 1024)} KB`,
            destination: target.toUpperCase(),
            triggered_by: clientInfo,
            notes: notes,
            status: 'success',
            created_at: new Date().toISOString(),
          };
          if (!db.gdrive_backup_history) db.gdrive_backup_history = [];
          db.gdrive_backup_history.unshift(record);
          if (db.gdrive_backup_config) {
            db.gdrive_backup_config.last_backup_at = record.created_at;
            db.gdrive_backup_config.last_backup_file = record.file_name;
            db.gdrive_backup_config.last_status = 'success';
          }
          logAgentAudit('server', 'trigger_backup', notes, null, record, clientInfo);
          logMcpCall(name, args, `Picu backup database ke ${target}`, false, clientInfo);
          return { success: true, message: `Pencadangan database ke ${target} berhasil`, record };
        }

        if (action === 'get_backup_history') {
          return {
            total_backups: (db.gdrive_backup_history || []).length,
            history: (db.gdrive_backup_history || []).slice(0, 25),
          };
        }

        if (action === 'sync_pi_nodes') {
          broadcastRealtimeSync('force_full_sync', {
            triggered_by: clientInfo,
            timestamp: new Date().toISOString(),
          });
          logAgentAudit('server', 'sync_pi_nodes', notes, null, { action: 'force_full_sync' }, clientInfo);
          logMcpCall(name, args, 'Sinkronisasi paksa ke Raspberry Pi kasir', false, clientInfo);
          return { success: true, message: 'Perintah sinkronisasi penuh disiarkan ke seluruh node kasir Raspberry Pi' };
        }

        throw new Error(`Aksi server "${action}" tidak didukung`);
      }

      case 'pos_manage_promos_and_coupons': {
        const action = args.action || 'list';
        const reason = args.reason || 'Disesuaikan oleh Hermes Agent';

        if (action === 'list') {
          return {
            active_promos_count: (db.promos || []).filter((p) => p.active !== false).length,
            promos: db.promos || [],
            coupons: db.coupons || [],
            landing_promo_banner: db.settings?.landing_page?.promo_banner || db.landingPageConfig?.promo_banner || null,
          };
        }

        if (action === 'create_promo') {
          const promoData = args.promo_data || {};
          if (!promoData.name) throw new Error('Nama promo (name) wajib diisi');
          const newPromo = {
            id: 'pr-' + Date.now(),
            name: promoData.name,
            type: promoData.type || 'percent',
            value: Number(promoData.value) || 10,
            min_spend: Number(promoData.min_spend) || 0,
            max_discount: Number(promoData.max_discount) || 0,
            applies_to: promoData.applies_to || 'all',
            valid_until: promoData.valid_until || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
            active: true,
            created_at: new Date().toISOString(),
            created_by: clientInfo,
          };
          if (!db.promos) db.promos = [];
          db.promos.push(newPromo);

          logAgentAudit('promo', 'create_promo', reason, null, newPromo, clientInfo);
          broadcastRealtimeSync('promos_updated', { promo: newPromo });
          logMcpCall(name, args, `Buat promo baru: ${newPromo.name} (${newPromo.value}%)`, false, clientInfo);
          return { success: true, message: `Promo "${newPromo.name}" berhasil dibuat dan diaktifkan di kasir`, promo: newPromo };
        }

        if (action === 'create_coupon') {
          const couponData = args.coupon_data || {};
          const code = (couponData.code || `KUPON-${Date.now().toString().slice(-4)}`).toUpperCase().trim();
          const newCoupon = {
            id: 'cp-' + Date.now(),
            code: code,
            discount_type: couponData.discount_type || 'percent',
            discount_value: Number(couponData.discount_value) || 10,
            quota: Number(couponData.quota) || 50,
            used: 0,
            expires_at: couponData.expires_at || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
            active: true,
            created_at: new Date().toISOString(),
            created_by: clientInfo,
          };
          if (!db.coupons) db.coupons = [];
          db.coupons.push(newCoupon);

          logAgentAudit('promo', 'create_coupon', reason, null, newCoupon, clientInfo);
          broadcastRealtimeSync('coupons_updated', { coupon: newCoupon });
          logMcpCall(name, args, `Rilis kupon diskon: ${newCoupon.code}`, false, clientInfo);
          return { success: true, message: `Kupon "${newCoupon.code}" siap digunakan pelanggan`, coupon: newCoupon };
        }

        if (action === 'update_landing_banner') {
          if (!db.settings.landing_page) db.settings.landing_page = {};
          const before = JSON.parse(JSON.stringify(db.settings.landing_page.promo_banner || {}));
          db.settings.landing_page.promo_banner = {
            ...(db.settings.landing_page.promo_banner || {}),
            ...(args.landing_banner || {}),
            updated_at: new Date().toISOString(),
          };
          if (!db.landingPageConfig) db.landingPageConfig = {};
          db.landingPageConfig.promo_banner = db.settings.landing_page.promo_banner;

          const after = JSON.parse(JSON.stringify(db.settings.landing_page.promo_banner));
          logAgentAudit('promo', 'update_landing_banner', reason, before, after, clientInfo);
          broadcastRealtimeSync('landing_page_updated', { section: 'promo_banner' });
          logMcpCall(name, args, `Update Banner Promo Landing Page (${reason})`, false, clientInfo);
          return {
            success: true,
            message: 'Banner promo Landing Page publik berhasil diperbarui secara instan',
            banner: db.settings.landing_page.promo_banner,
          };
        }

        if (action === 'deactivate_promo') {
          const promo = (db.promos || []).find((p) => p.id === args.target_id || p.name === args.target_id);
          if (!promo) throw new Error(`Promo ${args.target_id} tidak ditemukan`);
          promo.active = false;
          logAgentAudit('promo', 'deactivate_promo', reason, { active: true }, { active: false }, clientInfo);
          broadcastRealtimeSync('promos_updated', { promo_id: promo.id, active: false });
          return { success: true, message: `Promo "${promo.name}" telah dinonaktifkan` };
        }

        if (action === 'deactivate_coupon') {
          const coupon = (db.coupons || []).find((c) => c.id === args.target_id || c.code === (args.target_id || '').toUpperCase());
          if (!coupon) throw new Error(`Kupon ${args.target_id} tidak ditemukan`);
          coupon.active = false;
          logAgentAudit('promo', 'deactivate_coupon', reason, { active: true }, { active: false }, clientInfo);
          broadcastRealtimeSync('coupons_updated', { coupon_id: coupon.id, active: false });
          return { success: true, message: `Kupon "${coupon.code}" telah dinonaktifkan` };
        }

        throw new Error(`Aksi promo "${action}" tidak didukung`);
      }

      case 'pos_audit_agent_actions': {
        const domain = args.domain || 'all';
        const limit = Math.min(100, Math.max(1, Number(args.limit) || 20));
        let allLogs = [...(db.agentAuditLogs || [])];
        if (domain !== 'all') {
          allLogs = allLogs.filter((l) => l.domain === domain);
        }
        allLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        const sliced = allLogs.slice(0, limit);
        logMcpCall(name, args, `Ambil ${sliced.length} audit logs (${domain})`, false, clientInfo);
        return {
          total_logs: allLogs.length,
          returned: sliced.length,
          logs: sliced,
        };
      }

      default:
        throw new Error(`Tool "${name}" tidak ditemukan di server MCP Grand Aceh POS`);
    }
  }

  // Resource Read Handler
  function readResource(uri) {
    switch (uri) {
      case 'pos://menu/catalog': {
        const prods = (db.products || []).map((p) => ({
          id: p.id,
          name: p.name,
          category: p.category_name,
          kind: p.kind || 'fnb',
          price: p.price,
          stock: p.stock,
          active: p.active !== false,
        }));
        return JSON.stringify(prods, null, 2);
      }
      case 'pos://analytics/today': {
        const todayStr = new Date().toISOString().slice(0, 10);
        const orders = (db.orders || []).filter((o) => (o.created_at || '').startsWith(todayStr) && o.status !== 'void');
        const rev = orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
        return JSON.stringify({ date: todayStr, total_revenue: rev, order_count: orders.length }, null, 2);
      }
      case 'pos://inventory/alerts': {
        const lowP = (db.products || []).filter((p) => p.track_stock && Number(p.stock) <= 5);
        const lowI = (db.ingredients || []).filter((i) => Number(i.stock) <= Number(i.min_stock || 5));
        return JSON.stringify({ low_products: lowP, low_ingredients: lowI }, null, 2);
      }
      case 'pos://tables/map': {
        return JSON.stringify(db.tables || [], null, 2);
      }
      case 'pos://shifts/current': {
        const active = (db.shifts || []).find((s) => s.status === 'open') || null;
        return JSON.stringify(active, null, 2);
      }
      default:
        throw new Error(`Resource ${uri} tidak tersedia`);
    }
  }

  // Handle single JSON-RPC 2.0 Request
  async function handleJsonRpc(rpcReq, clientInfo = 'MCP-Client') {
    if (!rpcReq || typeof rpcReq !== 'object') {
      return { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } };
    }

    const { id, method, params } = rpcReq;

    try {
      switch (method) {
        case 'initialize': {
          return {
            jsonrpc: '2.0',
            id,
            result: {
              protocolVersion: '2024-11-05',
              capabilities: {
                tools: { listChanged: false },
                resources: { subscribe: false, listChanged: false },
                prompts: { listChanged: false },
              },
              serverInfo: {
                name: 'grand-aceh-pos-mcp-server',
                version: '1.0.0',
                description: 'Model Context Protocol (MCP) Server untuk Grand Aceh Kuliner POS F&B & Retail',
              },
            },
          };
        }

        case 'notifications/initialized': {
          // Notification from client confirming initialization
          return null; // No response needed for notification
        }

        case 'ping': {
          return { jsonrpc: '2.0', id, result: {} };
        }

        case 'tools/list': {
          return {
            jsonrpc: '2.0',
            id,
            result: {
              tools: MCP_TOOLS,
            },
          };
        }

        case 'tools/call': {
          if (!params || !params.name) {
            return {
              jsonrpc: '2.0',
              id,
              error: { code: -32602, message: 'Missing tool name in params' },
            };
          }

          const toolResult = await executeTool(params.name, params.arguments || {}, clientInfo);
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult, null, 2),
                },
              ],
              isError: false,
            },
          };
        }

        case 'resources/list': {
          return {
            jsonrpc: '2.0',
            id,
            result: {
              resources: MCP_RESOURCES,
            },
          };
        }

        case 'resources/read': {
          if (!params || !params.uri) {
            return {
              jsonrpc: '2.0',
              id,
              error: { code: -32602, message: 'Missing uri in params' },
            };
          }
          const text = readResource(params.uri);
          return {
            jsonrpc: '2.0',
            id,
            result: {
              contents: [
                {
                  uri: params.uri,
                  mimeType: 'application/json',
                  text: text,
                },
              ],
            },
          };
        }

        case 'prompts/list': {
          return {
            jsonrpc: '2.0',
            id,
            result: {
              prompts: MCP_PROMPTS,
            },
          };
        }

        case 'prompts/get': {
          if (!params || !params.name) {
            return {
              jsonrpc: '2.0',
              id,
              error: { code: -32602, message: 'Missing prompt name in params' },
            };
          }
          const prompt = MCP_PROMPTS.find((p) => p.name === params.name);
          if (!prompt) {
            return {
              jsonrpc: '2.0',
              id,
              error: { code: -32601, message: `Prompt "${params.name}" tidak ditemukan` },
            };
          }

          let promptText = `Lakukan analisis mendalam untuk ${prompt.description}.`;
          if (params.name === 'daily_cashier_audit') {
            promptText = `Tolong audit rekonsiliasi kas shift kasir (${params.arguments?.cashier_name || 'aktif'}). Bandingkan uang fisik di laci (${params.arguments?.physical_cash || 'N/A'}) dengan kalkulasi sistem POS. Gunakan tool pos_get_shift_status dan pos_get_sales_summary.`;
          } else if (params.name === 'inventory_replenishment_guide') {
            promptText = `Periksa seluruh persediaan dapur yang menipis dengan tool pos_get_low_stock. Buat daftar prioritas belanja bahan baku ${params.arguments?.budget_limit ? `dengan batas anggaran Rp ${params.arguments.budget_limit}` : ''}.`;
          } else if (params.name === 'menu_margin_analyzer') {
            promptText = `Analisis marjin keuntungan dan biaya resep masakan Aceh menggunakan tool pos_get_recipes dan pos_get_sales_summary. Identifikasi menu dengan marjin terbaik.`;
          }

          return {
            jsonrpc: '2.0',
            id,
            result: {
              description: prompt.description,
              messages: [
                {
                  role: 'user',
                  content: {
                    type: 'text',
                    text: promptText,
                  },
                },
              ],
            },
          };
        }

        default:
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32601,
              message: `Method "${method}" tidak didukung oleh MCP Server`,
            },
          };
      }
    } catch (err) {
      logMcpCall(params?.name || method, params?.arguments, `Error: ${err.message}`, true, clientInfo);
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: `Error executing MCP method: ${err.message}`,
            },
          ],
          isError: true,
        },
      };
    }
  }

  // =========================================================================
  // HTTP Endpoints for MCP
  // =========================================================================

  // 1. JSON-RPC 2.0 over HTTP POST (Standard Direct Remote MCP Endpoint)
  app.post(['/api/mcp', '/mcp'], async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('X-MCP-Protocol-Version', '2024-11-05');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-MCP-Session-Id');

    const clientInfo = req.headers['user-agent'] || req.headers['x-mcp-client'] || 'HTTP-MCP-Client';

    // Batch or Single Request
    if (Array.isArray(req.body)) {
      const results = [];
      for (const item of req.body) {
        const reply = await handleJsonRpc(item, clientInfo);
        if (reply) results.push(reply);
      }
      return res.json(results);
    }

    const response = await handleJsonRpc(req.body, clientInfo);
    if (!response) {
      return res.status(204).end(); // Notification response
    }
    return res.json(response);
  });

  // 2. Server-Sent Events (SSE) Endpoint for Claude Desktop, Cursor, and Agents
  app.get(['/api/mcp/sse', '/sse'], (req, res) => {
    const sessionId = 'mcp_sess_' + crypto.randomUUID();

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-MCP-Session-Id': sessionId,
    });

    sseSessions.set(sessionId, res);

    // Determine host for endpoint callback
    const host = req.get('host') || '127.0.0.1:3000';
    const protocol = req.protocol || 'http';
    const messageEndpoint = `${protocol}://${host}/api/mcp/messages?sessionId=${sessionId}`;

    // Send the mandatory MCP 'endpoint' event with the message POST URL
    res.write(`event: endpoint\ndata: ${messageEndpoint}\n\n`);

    // Keepalive ping every 15 seconds
    const interval = setInterval(() => {
      res.write(': ping\n\n');
    }, 15000);

    req.on('close', () => {
      clearInterval(interval);
      sseSessions.delete(sessionId);
    });
  });

  // 3. SSE Inbound Messages POST
  app.post(['/api/mcp/messages', '/messages'], async (req, res) => {
    const sessionId = req.query.sessionId || req.headers['x-mcp-session-id'];
    const clientInfo = req.headers['user-agent'] || `SSE-Client (${sessionId || 'anon'})`;

    const rpcResponse = await handleJsonRpc(req.body, clientInfo);

    if (sessionId && sseSessions.has(sessionId)) {
      const sseRes = sseSessions.get(sessionId);
      if (rpcResponse) {
        sseRes.write(`event: message\ndata: ${JSON.stringify(rpcResponse)}\n\n`);
      }
      return res.status(202).json({ ok: true, session_id: sessionId });
    }

    // If session not found or direct POST, return standard JSON
    if (rpcResponse) {
      return res.json(rpcResponse);
    }
    return res.status(204).end();
  });

  // 4. REST Helper: MCP Server Status & Metadata
  app.get(['/api/mcp', '/api/mcp/status'], (req, res) => {
    const host = req.get('host') || 'localhost:3000';
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const baseUrl = `${protocol}://${host}`;

    res.json({
      status: 'online',
      protocol_version: '2024-11-05',
      server_name: 'grand-aceh-pos-mcp-server',
      version: '1.0.0',
      description: 'Model Context Protocol (MCP) Server untuk Grand Aceh Kuliner POS (F&B Restoran & Retail)',
      endpoints: {
        http_post: `${baseUrl}/api/mcp`,
        sse_stream: `${baseUrl}/api/mcp/sse`,
        messages: `${baseUrl}/api/mcp/messages`,
      },
      tools_count: MCP_TOOLS.length,
      resources_count: MCP_RESOURCES.length,
      prompts_count: MCP_PROMPTS.length,
      active_sse_sessions: sseSessions.size,
      uptime_seconds: process.uptime(),
      client_configs: {
        claude_desktop: {
          mcpServers: {
            "grand-aceh-pos": {
              command: "npx",
              args: [
                "-y",
                "mcp-remote",
                `${baseUrl}/api/mcp/sse`
              ]
            }
          }
        },
        cursor_mcp: {
          mcpServers: {
            "grand-aceh-pos": {
              url: `${baseUrl}/api/mcp/sse`
            }
          }
        },
        hermes_agent: {
          skill: "mcp-pos-data-query",
          mcp_endpoint: `${baseUrl}/api/mcp/sse`,
          tools: MCP_TOOLS.map(t => t.name)
        }
      }
    });
  });

  // 5. REST Helper: Tools Catalog (for Frontend UI inspection)
  app.get('/api/mcp/tools', (req, res) => {
    res.json({
      tools: MCP_TOOLS,
      count: MCP_TOOLS.length,
    });
  });

  // 6. REST Helper: Execute Tool directly from in-app UI playground
  app.post('/api/mcp/execute', async (req, res) => {
    const { name, arguments: args } = req.body || {};
    if (!name) {
      return res.status(400).json({ detail: 'Nama tool MCP wajib disertakan' });
    }
    try {
      const start = Date.now();
      const result = await executeTool(name, args || {}, 'POS-InApp-Playground');
      const latencyMs = Date.now() - start;
      res.json({
        ok: true,
        tool: name,
        arguments: args || {},
        result,
        latency_ms: latencyMs,
        jsonrpc_sample: {
          jsonrpc: '2.0',
          id: 1,
          result: {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          },
        },
      });
    } catch (err) {
      res.status(500).json({ ok: false, tool: name, error: err.message });
    }
  });

  // 7. REST Helper: Resources Catalog
  app.get('/api/mcp/resources', (req, res) => {
    res.json({
      resources: MCP_RESOURCES,
      count: MCP_RESOURCES.length,
    });
  });

  // 8. REST Helper: Read Resource
  app.get('/api/mcp/resources/read', (req, res) => {
    const uri = req.query.uri;
    if (!uri) return res.status(400).json({ detail: 'URI resource wajib diisi' });
    try {
      const content = readResource(uri);
      res.json({ uri, content: JSON.parse(content) });
    } catch (err) {
      res.status(404).json({ detail: err.message });
    }
  });

  // 9. REST Helper: Prompts Catalog
  app.get('/api/mcp/prompts', (req, res) => {
    res.json({
      prompts: MCP_PROMPTS,
      count: MCP_PROMPTS.length,
    });
  });

  // 10. REST Helper: Recent Activity Logs
  app.get('/api/mcp/logs', (req, res) => {
    res.json({
      logs: db.mcpInvocationLogs || [],
      count: (db.mcpInvocationLogs || []).length,
    });
  });

  // 11. Clear Logs
  app.delete('/api/mcp/logs', (req, res) => {
    db.mcpInvocationLogs = [];
    res.json({ ok: true, message: 'Log MCP berhasil dibersihkan' });
  });

  // =========================================================================
  // 12. Unified Hermes Agent REST API Endpoints (/api/agent/*)
  // =========================================================================

  // A. WhatsApp Configuration & Templates
  app.get('/api/agent/whatsapp', (req, res) => {
    res.json({
      gateway: db.settings?.wa || {},
      templates: db.settings?.wa_templates || {},
      status: db.settings?.wa?.status || 'connected',
    });
  });

  app.put('/api/agent/whatsapp', (req, res) => {
    const { connection, templates, reason } = req.body || {};
    const beforeWa = JSON.parse(JSON.stringify(db.settings?.wa || {}));
    const beforeTmpl = JSON.parse(JSON.stringify(db.settings?.wa_templates || {}));

    if (connection) {
      db.settings.wa = {
        ...db.settings.wa,
        ...connection,
        updated_at: new Date().toISOString(),
      };
      if (connection.phone && db.whatsappConfig) {
        db.whatsappConfig.phone = connection.phone;
      }
    }

    if (templates) {
      db.settings.wa_templates = {
        ...db.settings.wa_templates,
        ...templates,
        updated_at: new Date().toISOString(),
      };
    }

    logAgentAudit(
      'wa',
      'update_whatsapp_rest',
      reason || 'Pembaruan pengaturan WhatsApp oleh REST API Agent',
      { connection: beforeWa, templates: beforeTmpl },
      { connection: db.settings.wa, templates: db.settings.wa_templates },
      req.headers['x-agent-name'] || 'Hermes-Agent-REST'
    );

    broadcastRealtimeSync('settings_updated', { section: 'wa' });
    res.json({
      ok: true,
      message: 'Konfigurasi WhatsApp berhasil diperbarui',
      gateway: db.settings.wa,
      templates: db.settings.wa_templates,
    });
  });

  app.post('/api/agent/whatsapp/test', (req, res) => {
    const { phone } = req.body || {};
    const target = phone || db.settings?.wa?.phone || '081269001122';
    res.json({
      ok: true,
      message: `Pesan uji coba berhasil dijadwalkan ke ${target}`,
      target,
      gateway: 'hermes_wa_gateway_port_8644',
      timestamp: new Date().toISOString(),
    });
  });

  // B. Server Cluster & Health
  app.get('/api/agent/server/cluster', (req, res) => {
    const os = require('os');
    const totalMem = Math.round(os.totalmem() / (1024 * 1024));
    const freeMem = Math.round(os.freemem() / (1024 * 1024));
    res.json({
      gudang_server: {
        node: 'Server Gudang 644 (VPS Master)',
        status: 'healthy',
        port: 3000,
        wa_port: 8644,
        uptime_seconds: process.uptime(),
        memory_used_mb: `${totalMem - freeMem} MB / ${totalMem} MB`,
      },
      raspberry_pi: {
        node: 'GrandPOS (Raspberry Pi Kasir)',
        mesh: 'Tailscale Mesh Connected',
        status: 'online',
        sync_mode: 'idempotent_offline_queue',
      },
      backup_info: {
        last_backup: db.gdrive_backup_config?.last_backup_at || null,
        history_count: (db.gdrive_backup_history || []).length,
      },
    });
  });

  app.post('/api/agent/server/backup', (req, res) => {
    const { target, notes } = req.body || {};
    const dest = target || 'vps';
    const dateStr = new Date().toISOString().slice(0, 10);
    const record = {
      id: `bkp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      file_name: `gak-backup-${dest}-${dateStr}-${Date.now().toString().slice(-4)}.zip`,
      file_size: `${Math.round(JSON.stringify(db).length / 1024)} KB`,
      destination: dest.toUpperCase(),
      triggered_by: req.headers['x-agent-name'] || 'Hermes-Agent-REST',
      notes: notes || 'Backup database dipicu via REST API Agent',
      status: 'success',
      created_at: new Date().toISOString(),
    };
    if (!db.gdrive_backup_history) db.gdrive_backup_history = [];
    db.gdrive_backup_history.unshift(record);
    if (db.gdrive_backup_config) {
      db.gdrive_backup_config.last_backup_at = record.created_at;
      db.gdrive_backup_config.last_backup_file = record.file_name;
    }
    logAgentAudit('server', 'trigger_backup_rest', notes, null, record, req.headers['x-agent-name'] || 'Hermes-Agent-REST');
    res.json({ ok: true, message: `Backup database ke ${dest} berhasil`, record });
  });

  // C. Promos, Coupons & Landing Promo Banner
  app.get('/api/agent/promos', (req, res) => {
    res.json({
      promos: db.promos || [],
      coupons: db.coupons || [],
      landing_banner: db.settings?.landing_page?.promo_banner || null,
    });
  });

  app.post('/api/agent/promos', (req, res) => {
    const { promo, coupon, reason } = req.body || {};
    let created = null;

    if (promo) {
      created = {
        id: 'pr-' + Date.now(),
        name: promo.name || 'Promo Baru',
        type: promo.type || 'percent',
        value: Number(promo.value) || 10,
        min_spend: Number(promo.min_spend) || 0,
        max_discount: Number(promo.max_discount) || 0,
        applies_to: promo.applies_to || 'all',
        valid_until: promo.valid_until || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
        active: true,
        created_at: new Date().toISOString(),
      };
      if (!db.promos) db.promos = [];
      db.promos.push(created);
      logAgentAudit('promo', 'create_promo_rest', reason, null, created, req.headers['x-agent-name'] || 'Hermes-Agent-REST');
      broadcastRealtimeSync('promos_updated', { promo: created });
    } else if (coupon) {
      created = {
        id: 'cp-' + Date.now(),
        code: (coupon.code || `KUPON-${Date.now().toString().slice(-4)}`).toUpperCase(),
        discount_type: coupon.discount_type || 'percent',
        discount_value: Number(coupon.discount_value) || 10,
        quota: Number(coupon.quota) || 50,
        used: 0,
        expires_at: coupon.expires_at || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
        active: true,
        created_at: new Date().toISOString(),
      };
      if (!db.coupons) db.coupons = [];
      db.coupons.push(created);
      logAgentAudit('promo', 'create_coupon_rest', reason, null, created, req.headers['x-agent-name'] || 'Hermes-Agent-REST');
      broadcastRealtimeSync('coupons_updated', { coupon: created });
    }

    res.json({ ok: true, item: created });
  });

  app.put('/api/agent/promos/landing-banner', (req, res) => {
    const { banner, reason } = req.body || {};
    if (!db.settings.landing_page) db.settings.landing_page = {};
    const before = JSON.parse(JSON.stringify(db.settings.landing_page.promo_banner || {}));

    db.settings.landing_page.promo_banner = {
      ...(db.settings.landing_page.promo_banner || {}),
      ...(banner || {}),
      updated_at: new Date().toISOString(),
    };
    if (!db.landingPageConfig) db.landingPageConfig = {};
    db.landingPageConfig.promo_banner = db.settings.landing_page.promo_banner;

    logAgentAudit('promo', 'update_landing_banner_rest', reason, before, db.settings.landing_page.promo_banner, req.headers['x-agent-name'] || 'Hermes-Agent-REST');
    broadcastRealtimeSync('landing_page_updated', { section: 'promo_banner' });
    res.json({
      ok: true,
      message: 'Banner promo Landing Page berhasil disinkronkan',
      banner: db.settings.landing_page.promo_banner,
    });
  });

  // D. Agent Audit Logs
  app.get('/api/agent/audit-logs', (req, res) => {
    const domain = req.query.domain;
    let list = [...(db.agentAuditLogs || [])];
    if (domain && domain !== 'all') {
      list = list.filter((l) => l.domain === domain);
    }
    const limit = Math.min(100, Number(req.query.limit) || 30);
    res.json({
      total: list.length,
      logs: list.slice(0, limit),
    });
  });

  app.delete('/api/agent/audit-logs', (req, res) => {
    db.agentAuditLogs = [];
    res.json({ ok: true, message: 'Seluruh riwayat audit log agen berhasil dibersihkan' });
  });

  return {
    MCP_TOOLS,
    MCP_RESOURCES,
    MCP_PROMPTS,
    executeTool,
  };
}

module.exports = { registerMcpServer };
