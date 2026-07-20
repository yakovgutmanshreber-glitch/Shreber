"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/client";
import { formatCurrency } from "@/lib/format";
import { Modal, PageHeader, EmptyState, ConfirmButton } from "@/components/ui";

interface Category {
  id: number;
  mainCategory: string;
  category: string;
  defaultPrice: number;
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setCategories(await api<Category[]>("/api/categories"));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function remove(id: number) {
    await api(`/api/categories/${id}`, { method: "DELETE" });
    load();
  }

  const grouped = categories.reduce<Record<string, Category[]>>((acc, c) => {
    (acc[c.mainCategory] ??= []).push(c);
    return acc;
  }, {});

  return (
    <div>
      <PageHeader
        title="קטגוריות"
        subtitle="ניהול קטגוריות ראשיות, תת-קטגוריות ומחירי ברירת מחדל"
        action={
          <button
            className="btn-primary"
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            + קטגוריה חדשה
          </button>
        }
      />

      {loading ? (
        <div className="card p-8 text-center text-gray-400">טוען…</div>
      ) : categories.length === 0 ? (
        <EmptyState message="אין קטגוריות" />
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([main, items]) => (
            <div key={main} className="card overflow-hidden">
              <div className="border-b border-gray-200 bg-gray-50 px-4 py-2 font-semibold text-gray-700">
                {main}
              </div>
              <table className="w-full">
                <tbody className="divide-y divide-gray-100">
                  {items.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="td font-medium">{c.category}</td>
                      <td className="td text-gray-600">{formatCurrency(c.defaultPrice)}</td>
                      <td className="td text-left">
                        <button
                          className="text-sm text-brand-600 hover:underline"
                          onClick={() => {
                            setEditing(c);
                            setModalOpen(true);
                          }}
                        >
                          עריכה
                        </button>
                        <ConfirmButton
                          className="mr-3 text-sm text-red-600 hover:underline"
                          message={`למחוק את הקטגוריה "${c.category}"?`}
                          onConfirm={() => remove(c.id)}
                        >
                          מחיקה
                        </ConfirmButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "עריכת קטגוריה" : "קטגוריה חדשה"}
      >
        <CategoryForm
          category={editing}
          onSaved={() => {
            setModalOpen(false);
            load();
          }}
          onCancel={() => setModalOpen(false)}
        />
      </Modal>
    </div>
  );
}

function CategoryForm({
  category,
  onSaved,
  onCancel,
}: {
  category: Category | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    mainCategory: category?.mainCategory ?? "",
    category: category?.category ?? "",
    defaultPrice: category?.defaultPrice ?? 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (category) {
        await api(`/api/categories/${category.id}`, { method: "PATCH", body: form });
      } else {
        await api("/api/categories", { method: "POST", body: form });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label">קטגוריה ראשית *</label>
        <input
          className="input"
          value={form.mainCategory}
          onChange={(e) => setForm((f) => ({ ...f, mainCategory: e.target.value }))}
          required
        />
      </div>
      <div>
        <label className="label">קטגוריה *</label>
        <input
          className="input"
          value={form.category}
          onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
          required
        />
      </div>
      <div>
        <label className="label">מחיר ברירת מחדל (₪)</label>
        <input
          type="number"
          step="0.01"
          className="input"
          value={form.defaultPrice}
          onChange={(e) => setForm((f) => ({ ...f, defaultPrice: Number(e.target.value) }))}
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onCancel}>
          ביטול
        </button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? "שומר…" : "שמירה"}
        </button>
      </div>
    </form>
  );
}
