import React, { useState, useEffect } from "react";
import api, { apiError } from "@/lib/api";
import { toast } from "sonner";
import {
  BookOpen, Plus, Trash2, Edit3, Eye, CheckCircle2,
  Clock, Tag, Search, ArrowLeft, RefreshCw, X
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function ArticlesAdmin() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [form, setForm] = useState({
    title: "",
    category: "Filosofi Rempah",
    excerpt: "",
    content: "",
    author: "Dapur Utama Grand Aceh",
    read_time: "4 menit baca",
    status: "published",
    cover_image: "",
  });

  const loadArticles = async () => {
    setLoading(true);
    try {
      const res = await api.get("/articles");
      setArticles(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      toast.error(apiError(err, "Gagal memuat daftar artikel"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadArticles();
  }, []);

  const handleOpenCreate = () => {
    setEditingId(null);
    setForm({
      title: "",
      category: "Filosofi Rempah",
      excerpt: "",
      content: "",
      author: "Dapur Utama Grand Aceh",
      read_time: "4 menit baca",
      status: "published",
      cover_image: "",
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (art) => {
    setEditingId(art.id);
    setForm({
      title: art.title || "",
      category: art.category || "Filosofi Rempah",
      excerpt: art.excerpt || "",
      content: art.content || "",
      author: art.author || "Dapur Utama Grand Aceh",
      read_time: art.read_time || "4 menit baca",
      status: art.status || "published",
      cover_image: art.cover_image || "",
    });
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error("Judul artikel wajib diisi");
      return;
    }

    try {
      if (editingId) {
        await api.put(`/articles/${editingId}`, form);
        toast.success("Artikel berhasil diperbarui");
      } else {
        await api.post("/articles", form);
        toast.success("Artikel baru berhasil dibuat dan diterbitkan");
      }
      setModalOpen(false);
      loadArticles();
    } catch (err) {
      toast.error(apiError(err, "Gagal menyimpan artikel"));
    }
  };

  const handleDelete = async (id, title) => {
    if (!window.confirm(`Yakin ingin menghapus artikel "${title}"?`)) return;
    try {
      await api.delete(`/articles/${id}`);
      toast.success("Artikel berhasil dihapus");
      loadArticles();
    } catch (err) {
      toast.error(apiError(err, "Gagal menghapus artikel"));
    }
  };

  const filtered = articles.filter(
    (a) =>
      a.title?.toLowerCase().includes(search.toLowerCase()) ||
      a.category?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-amber-700" />
            <span>Kelola Artikel & Cerita Kuliner Aceh</span>
          </h1>
          <p className="text-xs text-stone-500 mt-1">
            Artikel yang berstatus "Diterbitkan" (Published) akan otomatis tampil di Landing Page publik sebelum login.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadArticles}
            className="p-2 text-stone-600 hover:text-stone-900 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors"
            title="Muat ulang"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={handleOpenCreate}
            className="px-4 py-2 text-xs font-semibold bg-amber-800 hover:bg-amber-900 text-white rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Tulis Artikel Baru</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari berdasarkan judul atau kategori..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs bg-white rounded-lg border border-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-800/30"
          />
        </div>
        <div className="text-xs text-stone-500 font-medium">
          Total: <span className="font-bold text-stone-900">{articles.length}</span> artikel
        </div>
      </div>

      {/* Article List Table */}
      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden shadow-sm">
        {loading ? (
          <div className="py-16 text-center text-xs text-stone-500">Memuat artikel...</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-xs text-stone-500 space-y-2">
            <BookOpen className="w-8 h-8 text-stone-300 mx-auto" />
            <p>Belum ada artikel ditemukan</p>
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-stone-50 border-b border-stone-200 text-stone-600 font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4">Judul Artikel</th>
                <th className="py-3 px-4">Kategori</th>
                <th className="py-3 px-4">Penulis</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filtered.map((art) => (
                <tr key={art.id} className="hover:bg-stone-50/70 transition-colors">
                  <td className="py-3.5 px-4 font-medium text-stone-900 max-w-md">
                    <div className="truncate font-semibold">{art.title}</div>
                    <div className="text-[11px] text-stone-400 truncate mt-0.5">{art.excerpt}</div>
                  </td>
                  <td className="py-3.5 px-4 text-stone-600 whitespace-nowrap">
                    {art.category}
                  </td>
                  <td className="py-3.5 px-4 text-stone-600 whitespace-nowrap">
                    {art.author || "Dapur Grand Aceh"}
                  </td>
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${
                        art.status === "published"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-amber-50 text-amber-700 border border-amber-200"
                      }`}
                    >
                      {art.status === "published" ? "Diterbitkan" : "Draft"}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right whitespace-nowrap space-x-2">
                    <button
                      onClick={() => handleOpenEdit(art)}
                      className="p-1.5 text-stone-600 hover:text-amber-800 rounded hover:bg-stone-100 transition-colors"
                      title="Edit Artikel"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(art.id, art.title)}
                      className="p-1.5 text-rose-600 hover:text-rose-800 rounded hover:bg-rose-50 transition-colors"
                      title="Hapus Artikel"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create / Edit Dialog Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-stone-900">
              {editingId ? "Edit Artikel Kuliner" : "Tulis Cerita Kuliner Baru"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-4 pt-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-stone-700">Judul Artikel *</label>
              <input
                type="text"
                required
                placeholder="cth. Rahasia Kuah Beulangong Aceh"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-white rounded-lg border border-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-800/30 text-stone-900"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-stone-700">Kategori</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-white rounded-lg border border-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-800/30 text-stone-900"
                >
                  <option value="Filosofi Rempah">Filosofi Rempah</option>
                  <option value="Tradisi Kopi">Tradisi Kopi</option>
                  <option value="Resep Warisan">Resep Warisan</option>
                  <option value="Kuliner Otentik">Kuliner Otentik</option>
                  <option value="Budaya Serambi">Budaya Serambi</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-stone-700">Penulis</label>
                <input
                  type="text"
                  value={form.author}
                  onChange={(e) => setForm({ ...form, author: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-white rounded-lg border border-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-800/30 text-stone-900"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-stone-700">Status Publikasi</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-white rounded-lg border border-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-800/30 text-stone-900"
                >
                  <option value="published">Diterbitkan (Published)</option>
                  <option value="draft">Draf (Disimpan Internal)</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-stone-700">Ringkasan / Excerpt *</label>
              <textarea
                rows={2}
                required
                placeholder="Ringkasan singkat 1-2 kalimat untuk kartu depan..."
                value={form.excerpt}
                onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-white rounded-lg border border-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-800/30 text-stone-900"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-stone-700">Konten Lengkap Cerita *</label>
              <textarea
                rows={6}
                required
                placeholder="Tuliskan cerita sejarah, bahan rempah, atau filosofi hidangan secara lengkap..."
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-white rounded-lg border border-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-800/30 text-stone-900"
              />
            </div>

            <div className="pt-3 flex items-center justify-end gap-2 border-t border-stone-200">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-stone-600 hover:text-stone-900 bg-stone-100 rounded-lg transition-colors"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-amber-800 hover:bg-amber-900 rounded-lg transition-colors shadow-sm"
              >
                {editingId ? "Perbarui Artikel" : "Terbitkan Artikel"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
