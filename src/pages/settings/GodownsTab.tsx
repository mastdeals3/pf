import { useState, useEffect } from 'react';
import { Warehouse, Plus, Pencil, Trash2, Package, AlertTriangle, Search, BarChart2, Phone, MapPin, X, CheckCircle, Hash, User } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/utils';
import { useAuth } from '../../contexts/AuthContext';
import type { Godown, GodownStock } from '../../types';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { processStockMovement } from '../../services/stockService';

interface GodownFormData {
  name: string;
  location: string;
  manager_name: string;
  phone: string;
  code: string;
}

const emptyForm: GodownFormData = { name: '', location: '', manager_name: '', phone: '', code: '' };

interface AdjustState {
  stockId: string;
  productId: string;
  productName: string;
  currentQty: number;
  newQty: string;
}

export default function GodownsTab() {
  const { isAdmin } = useAuth();
  const [godowns, setGodowns] = useState<Godown[]>([]);
  const [selectedGodown, setSelectedGodown] = useState<Godown | null>(null);
  const [godownStock, setGodownStock] = useState<GodownStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [stockLoading, setStockLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [editing, setEditing] = useState<Godown | null>(null);
  const [form, setForm] = useState<GodownFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [stockSearch, setStockSearch] = useState('');
  const [adjusting, setAdjusting] = useState<AdjustState | null>(null);
  const [adjustSaving, setAdjustSaving] = useState(false);

  useEffect(() => { loadGodowns(); }, []);
  useEffect(() => {
    if (selectedGodown) loadGodownStock(selectedGodown.id);
  }, [selectedGodown]);

  const loadGodowns = async () => {
    setLoading(true);
    const { data } = await supabase.from('godowns').select('*').order('name');
    setGodowns(data || []);
    if (!selectedGodown && data && data.length > 0) setSelectedGodown(data[0]);
    setLoading(false);
  };

  const loadGodownStock = async (godownId: string) => {
    setStockLoading(true);
    const { data } = await supabase
      .from('godown_stock')
      .select('*, products(id, name, sku, unit, low_stock_alert, selling_price)')
      .eq('godown_id', godownId)
      .order('quantity', { ascending: true });
    setGodownStock((data || []) as GodownStock[]);
    setStockLoading(false);
  };

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (g: Godown) => {
    setEditing(g);
    setForm({ name: g.name, location: g.location || '', manager_name: g.manager_name || '', phone: g.phone || '', code: g.code || '' });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      location: form.location.trim(),
      manager_name: form.manager_name.trim(),
      phone: form.phone.trim(),
      code: form.code.trim(),
      updated_at: new Date().toISOString(),
    };
    if (editing) {
      await supabase.from('godowns').update(payload).eq('id', editing.id);
    } else {
      await supabase.from('godowns').insert({ ...payload, is_active: true }).select().maybeSingle();
    }
    setSaving(false);
    setShowModal(false);
    await loadGodowns();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await supabase.from('godowns').update({ is_active: false }).eq('id', deleteTarget);
    setDeleteTarget(null);
    setShowDeleteDialog(false);
    if (selectedGodown?.id === deleteTarget) setSelectedGodown(null);
    await loadGodowns();
  };

  const handleAdjustSave = async () => {
    if (!adjusting || adjusting.newQty === '' || !selectedGodown) return;
    const target = parseFloat(adjusting.newQty);
    if (isNaN(target) || target < 0) return;
    const delta = target - adjusting.currentQty;
    setAdjustSaving(true);
    if (delta !== 0) {
      await processStockMovement({
        type: 'adjustment',
        items: [{ product_id: adjusting.productId, godown_id: selectedGodown.id, quantity: delta }],
        reference_type: 'manual_adjustment',
        notes: `Manual adjust — ${adjusting.productName}`,
      });
    }
    setAdjusting(null);
    setAdjustSaving(false);
    await loadGodownStock(selectedGodown.id);
  };

  const filteredStock = godownStock.filter(s =>
    !stockSearch ||
    s.products?.name.toLowerCase().includes(stockSearch.toLowerCase()) ||
    s.products?.sku?.toLowerCase().includes(stockSearch.toLowerCase())
  );

  const totalStockValue = godownStock.reduce((sum, s) => sum + (s.quantity * (s.products?.selling_price || 0)), 0);
  const lowStockItems = godownStock.filter(s => s.products && s.quantity > 0 && s.quantity <= s.products.low_stock_alert).length;
  const outOfStockItems = godownStock.filter(s => s.quantity === 0).length;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex overflow-hidden" style={{ minHeight: '600px' }}>
      <div className="w-64 bg-white border-r border-neutral-200 flex flex-col shrink-0">
        <div className="p-4 border-b border-neutral-100">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-bold text-neutral-800 flex items-center gap-2">
              <Warehouse className="w-4 h-4 text-primary-600" />
              Godowns
            </h2>
            {isAdmin && (
              <button onClick={openAdd} className="btn-primary flex items-center gap-1 text-xs px-2 py-1">
                <Plus className="w-3 h-3" /> Add
              </button>
            )}
          </div>
          <p className="text-xs text-neutral-400">{godowns.filter(g => g.is_active).length} active locations</p>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {godowns.map(g => (
            <button
              key={g.id}
              onClick={() => setSelectedGodown(g)}
              className={`w-full text-left px-3 py-2.5 rounded-lg transition-all group ${selectedGodown?.id === g.id ? 'bg-primary-600 text-white' : 'hover:bg-neutral-50 text-neutral-700'}`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-xs font-semibold ${selectedGodown?.id === g.id ? 'text-white' : 'text-neutral-800'}`}>{g.name}</span>
                {!g.is_active && <span className="text-[9px] bg-neutral-200 text-neutral-500 px-1 rounded">Inactive</span>}
              </div>
              {g.location && <p className={`text-[10px] mt-0.5 truncate ${selectedGodown?.id === g.id ? 'text-white/70' : 'text-neutral-400'}`}>{g.location}</p>}
              {g.code && <p className={`text-[9px] mt-0.5 ${selectedGodown?.id === g.id ? 'text-white/60' : 'text-neutral-300'}`}>#{g.code}</p>}
            </button>
          ))}
          {godowns.length === 0 && (
            <p className="text-xs text-neutral-400 text-center py-8">No godowns yet</p>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-neutral-50">
        {selectedGodown ? (
          <div className="p-6 space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-xl font-bold text-neutral-900">{selectedGodown.name}</h1>
                <div className="flex items-center gap-4 mt-1 flex-wrap">
                  {selectedGodown.location && (
                    <span className="flex items-center gap-1 text-xs text-neutral-500">
                      <MapPin className="w-3 h-3" /> {selectedGodown.location}
                    </span>
                  )}
                  {selectedGodown.manager_name && (
                    <span className="flex items-center gap-1 text-xs text-neutral-500">
                      <User className="w-3 h-3" /> {selectedGodown.manager_name}
                    </span>
                  )}
                  {selectedGodown.phone && (
                    <span className="flex items-center gap-1 text-xs text-neutral-500">
                      <Phone className="w-3 h-3" /> {selectedGodown.phone}
                    </span>
                  )}
                  {selectedGodown.code && (
                    <span className="flex items-center gap-1 text-xs text-neutral-400">
                      <Hash className="w-3 h-3" /> {selectedGodown.code}
                    </span>
                  )}
                </div>
              </div>
              {isAdmin && (
                <div className="flex items-center gap-2">
                  <button onClick={() => openEdit(selectedGodown)} className="btn-secondary flex items-center gap-1.5 text-xs">
                    <Pencil className="w-3 h-3" /> Edit
                  </button>
                  <button onClick={() => { setDeleteTarget(selectedGodown.id); setShowDeleteDialog(true); }}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors">
                    <Trash2 className="w-3 h-3" /> Deactivate
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-4 gap-4">
              <div className="card">
                <div className="flex items-center gap-2 mb-1">
                  <Package className="w-4 h-4 text-primary-600" />
                  <p className="text-xs text-neutral-500">Total Products</p>
                </div>
                <p className="text-2xl font-bold text-neutral-900">{godownStock.length}</p>
              </div>
              <div className="card">
                <div className="flex items-center gap-2 mb-1">
                  <BarChart2 className="w-4 h-4 text-blue-600" />
                  <p className="text-xs text-neutral-500">Stock Value</p>
                </div>
                <p className="text-xl font-bold text-neutral-900">{formatCurrency(totalStockValue)}</p>
              </div>
              <div className="card">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="w-4 h-4 text-warning-600" />
                  <p className="text-xs text-neutral-500">Low Stock</p>
                </div>
                <p className={`text-2xl font-bold ${lowStockItems > 0 ? 'text-warning-600' : 'text-neutral-400'}`}>{lowStockItems}</p>
              </div>
              <div className="card">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="w-4 h-4 text-error-600" />
                  <p className="text-xs text-neutral-500">Out of Stock</p>
                </div>
                <p className={`text-2xl font-bold ${outOfStockItems > 0 ? 'text-error-600' : 'text-neutral-400'}`}>{outOfStockItems}</p>
              </div>
            </div>

            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-neutral-800">Stock Inventory</h3>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                  <input
                    type="text"
                    placeholder="Search products..."
                    value={stockSearch}
                    onChange={e => setStockSearch(e.target.value)}
                    className="input pl-8 py-1.5 text-xs w-48"
                  />
                </div>
              </div>
              {stockLoading ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : filteredStock.length === 0 ? (
                <div className="text-center py-12">
                  <Package className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
                  <p className="text-sm text-neutral-500">No stock recorded for this godown</p>
                  <p className="text-xs text-neutral-400 mt-1">Stock is automatically updated when purchases are received into this godown</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-neutral-100">
                        <th className="table-header text-left">Product</th>
                        <th className="table-header text-left">SKU</th>
                        <th className="table-header text-right">Qty</th>
                        <th className="table-header text-left">Unit</th>
                        <th className="table-header text-right">Value</th>
                        <th className="table-header text-left">Status</th>
                        <th className="table-header text-left">Level</th>
                        {isAdmin && <th className="table-header text-center">Adjust</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStock.map(s => {
                        const product = s.products;
                        const alertQty = product?.low_stock_alert || 0;
                        const isOut = s.quantity === 0;
                        const isLow = !isOut && alertQty > 0 && s.quantity <= alertQty;
                        const stockPct = alertQty > 0 ? Math.min(100, (s.quantity / (alertQty * 3)) * 100) : 100;
                        const isAdjusting = adjusting?.stockId === s.id;

                        return (
                          <tr key={s.id} className={`border-b border-neutral-50 transition-colors ${isAdjusting ? 'bg-blue-50' : 'hover:bg-neutral-50'}`}>
                            <td className="table-cell font-medium text-neutral-800">{product?.name || '—'}</td>
                            <td className="table-cell text-xs text-neutral-500">{product?.sku || '—'}</td>
                            <td className="table-cell text-right">
                              {isAdjusting ? (
                                <input
                                  type="number"
                                  min="0"
                                  className="w-20 px-2 py-1 text-xs border border-blue-300 rounded-lg text-right font-bold focus:outline-none focus:ring-2 focus:ring-blue-400"
                                  value={adjusting.newQty}
                                  onChange={e => setAdjusting({ ...adjusting, newQty: e.target.value })}
                                  autoFocus
                                  onKeyDown={e => { if (e.key === 'Enter') handleAdjustSave(); if (e.key === 'Escape') setAdjusting(null); }}
                                />
                              ) : (
                                <span className="font-bold text-neutral-900">{s.quantity}</span>
                              )}
                            </td>
                            <td className="table-cell text-xs text-neutral-500">{product?.unit || '—'}</td>
                            <td className="table-cell text-right text-xs text-neutral-600">{formatCurrency(s.quantity * (product?.selling_price || 0))}</td>
                            <td className="table-cell">
                              {isOut ? (
                                <span className="badge bg-error-50 text-error-700">Out of Stock</span>
                              ) : isLow ? (
                                <span className="badge bg-warning-50 text-warning-700">Low Stock</span>
                              ) : (
                                <span className="badge bg-success-50 text-success-700">In Stock</span>
                              )}
                            </td>
                            <td className="table-cell w-24">
                              <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${isOut ? 'bg-error-500' : isLow ? 'bg-warning-500' : 'bg-success-500'}`}
                                  style={{ width: `${stockPct}%` }}
                                />
                              </div>
                            </td>
                            {isAdmin && (
                              <td className="table-cell text-center">
                                {isAdjusting ? (
                                  <div className="flex items-center justify-center gap-1">
                                    <button onClick={handleAdjustSave} disabled={adjustSaving}
                                      className="w-6 h-6 rounded-md bg-success-500 text-white flex items-center justify-center hover:bg-success-600 transition-colors">
                                      <CheckCircle className="w-3.5 h-3.5" />
                                    </button>
                                    <button onClick={() => setAdjusting(null)}
                                      className="w-6 h-6 rounded-md bg-neutral-200 text-neutral-600 flex items-center justify-center hover:bg-neutral-300 transition-colors">
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setAdjusting({ stockId: s.id, productId: s.product_id, productName: product?.name || '', currentQty: s.quantity, newQty: String(s.quantity) })}
                                    className="text-[10px] px-2 py-0.5 rounded border border-neutral-200 text-neutral-500 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                                    Edit
                                  </button>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center py-24">
            <div className="text-center">
              <Warehouse className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
              <p className="text-sm text-neutral-500">Select a godown to view details</p>
              {isAdmin && (
                <button onClick={openAdd} className="btn-primary mt-4 flex items-center gap-2 mx-auto">
                  <Plus className="w-4 h-4" /> Add Godown
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
              <h2 className="text-base font-semibold text-neutral-900">{editing ? 'Edit Godown' : 'Add Godown'}</h2>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-lg hover:bg-neutral-100 flex items-center justify-center text-neutral-400 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 py-4 space-y-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-neutral-700">Godown Name <span className="text-error-500">*</span></label>
                <input
                  className="input w-full"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Main Warehouse"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-neutral-700 flex items-center gap-1.5">
                    <Hash className="w-3.5 h-3.5 text-neutral-400" /> Code
                  </label>
                  <input
                    className="input w-full"
                    value={form.code}
                    onChange={e => setForm({ ...form, code: e.target.value })}
                    placeholder="e.g. GDN-KOP"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-neutral-700 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-neutral-400" /> Phone
                  </label>
                  <input
                    className="input w-full"
                    value={form.phone}
                    onChange={e => setForm({ ...form, phone: e.target.value })}
                    placeholder="Contact number"
                    type="tel"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-neutral-700 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-neutral-400" /> Location / Address
                </label>
                <input
                  className="input w-full"
                  value={form.location}
                  onChange={e => setForm({ ...form, location: e.target.value })}
                  placeholder="e.g. Plot 12, Industrial Area, Pune"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-neutral-700 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-neutral-400" /> Manager Name
                </label>
                <input
                  className="input w-full"
                  value={form.manager_name}
                  onChange={e => setForm({ ...form, manager_name: e.target.value })}
                  placeholder="e.g. Rajesh Kumar"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 bg-neutral-50 border-t border-neutral-100">
              <button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
              <button onClick={handleSave} disabled={saving || !form.name.trim()} className="btn-primary min-w-[140px]">
                {saving ? (
                  <span className="flex items-center gap-2 justify-center">
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Saving...
                  </span>
                ) : editing ? 'Update Godown' : 'Create Godown'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleDelete}
        title="Deactivate Godown"
        message="This will deactivate the godown. Existing stock records will be preserved."
        confirmLabel="Deactivate"
        isDanger
      />
    </div>
  );
}
