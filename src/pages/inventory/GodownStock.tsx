import { useState, useEffect } from 'react';
import { Warehouse, Package, AlertTriangle, Search, BarChart2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/utils';
import type { Godown, GodownStock } from '../../types';

export default function GodownStockPage() {
  const [godowns, setGodowns] = useState<Godown[]>([]);
  const [selectedGodown, setSelectedGodown] = useState<Godown | null>(null);
  const [godownStock, setGodownStock] = useState<GodownStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockSearch, setStockSearch] = useState('');

  useEffect(() => { loadGodowns(); }, []);
  useEffect(() => {
    if (selectedGodown) loadGodownStock(selectedGodown.id);
  }, [selectedGodown]);

  const loadGodowns = async () => {
    setLoading(true);
    const { data } = await supabase.from('godowns').select('*').eq('is_active', true).order('name');
    setGodowns(data || []);
    if (data && data.length > 0) setSelectedGodown(data[0]);
    setLoading(false);
  };

  const loadGodownStock = async (godownId: string) => {
    setStockLoading(true);
    const { data } = await supabase
      .from('godown_stock')
      .select('*, products(id, name, sku, unit, low_stock_alert, selling_price, purchase_price)')
      .eq('godown_id', godownId)
      .order('quantity', { ascending: true });
    setGodownStock((data || []) as GodownStock[]);
    setStockLoading(false);
  };

  const filteredStock = godownStock.filter(s =>
    !stockSearch ||
    s.products?.name.toLowerCase().includes(stockSearch.toLowerCase()) ||
    s.products?.sku?.toLowerCase().includes(stockSearch.toLowerCase())
  );

  const totalStockValue = godownStock.reduce((sum, s) => sum + (s.quantity * (s.products?.selling_price || 0)), 0);
  const lowStockItems = godownStock.filter(s => s.products && s.quantity > 0 && s.quantity <= s.products.low_stock_alert).length;
  const outOfStockItems = godownStock.filter(s => s.quantity === 0).length;
  const inStockItems = godownStock.filter(s => s.quantity > 0).length;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      <div className="w-56 bg-white border-r border-neutral-200 flex flex-col shrink-0">
        <div className="p-4 border-b border-neutral-100">
          <h2 className="text-sm font-bold text-neutral-800 flex items-center gap-2">
            <Warehouse className="w-4 h-4 text-primary-600" />
            Godowns
          </h2>
          <p className="text-xs text-neutral-400 mt-0.5">{godowns.length} active locations</p>
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
              </div>
              {g.location && <p className={`text-[10px] mt-0.5 truncate ${selectedGodown?.id === g.id ? 'text-white/70' : 'text-neutral-400'}`}>{g.location}</p>}
              {g.code && <p className={`text-[9px] mt-0.5 ${selectedGodown?.id === g.id ? 'text-white/60' : 'text-neutral-300'}`}>#{g.code}</p>}
            </button>
          ))}
          {godowns.length === 0 && (
            <p className="text-xs text-neutral-400 text-center py-8">No godowns configured</p>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-neutral-50">
        {selectedGodown ? (
          <div className="p-6 space-y-5">
            <div>
              <h1 className="text-xl font-bold text-neutral-900">{selectedGodown.name} — Stock</h1>
              <p className="text-xs text-neutral-500 mt-0.5">
                {selectedGodown.location && `${selectedGodown.location} · `}
                Live godown-wise stock levels
              </p>
            </div>

            <div className="grid grid-cols-4 gap-4">
              <div className="card">
                <div className="flex items-center gap-2 mb-1">
                  <Package className="w-4 h-4 text-primary-600" />
                  <p className="text-xs text-neutral-500">In Stock</p>
                </div>
                <p className="text-2xl font-bold text-neutral-900">{inStockItems}</p>
                <p className="text-[10px] text-neutral-400 mt-0.5">products available</p>
              </div>
              <div className="card">
                <div className="flex items-center gap-2 mb-1">
                  <BarChart2 className="w-4 h-4 text-blue-600" />
                  <p className="text-xs text-neutral-500">Stock Value</p>
                </div>
                <p className="text-xl font-bold text-neutral-900">{formatCurrency(totalStockValue)}</p>
                <p className="text-[10px] text-neutral-400 mt-0.5">at selling price</p>
              </div>
              <div className="card">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="w-4 h-4 text-warning-600" />
                  <p className="text-xs text-neutral-500">Low Stock</p>
                </div>
                <p className={`text-2xl font-bold ${lowStockItems > 0 ? 'text-warning-600' : 'text-neutral-400'}`}>{lowStockItems}</p>
                <p className="text-[10px] text-neutral-400 mt-0.5">need replenishment</p>
              </div>
              <div className="card">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="w-4 h-4 text-error-600" />
                  <p className="text-xs text-neutral-500">Out of Stock</p>
                </div>
                <p className={`text-2xl font-bold ${outOfStockItems > 0 ? 'text-error-600' : 'text-neutral-400'}`}>{outOfStockItems}</p>
                <p className="text-[10px] text-neutral-400 mt-0.5">zero quantity</p>
              </div>
            </div>

            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-neutral-800">Product Stock Levels</h3>
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
                  <p className="text-xs text-neutral-400 mt-1">Stock is updated automatically when purchases are received or invoices are created</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-neutral-100">
                        <th className="table-header text-left">Product</th>
                        <th className="table-header text-left">SKU</th>
                        <th className="table-header text-right">Quantity</th>
                        <th className="table-header text-left">Unit</th>
                        <th className="table-header text-right">Stock Value</th>
                        <th className="table-header text-left">Status</th>
                        <th className="table-header text-left">Level</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStock.map(s => {
                        const product = s.products;
                        const alertQty = product?.low_stock_alert || 0;
                        const isOut = s.quantity === 0;
                        const isLow = !isOut && alertQty > 0 && s.quantity <= alertQty;
                        const stockPct = alertQty > 0 ? Math.min(100, (s.quantity / (alertQty * 3)) * 100) : 100;

                        return (
                          <tr key={s.id} className="border-b border-neutral-50 hover:bg-neutral-50 transition-colors">
                            <td className="table-cell font-medium text-neutral-800">{product?.name || '—'}</td>
                            <td className="table-cell text-xs text-neutral-500">{product?.sku || '—'}</td>
                            <td className="table-cell text-right">
                              <span className={`font-bold ${isOut ? 'text-error-600' : isLow ? 'text-warning-600' : 'text-neutral-900'}`}>
                                {s.quantity}
                              </span>
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
          <div className="flex-1 flex items-center justify-center h-full">
            <div className="text-center">
              <Warehouse className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
              <p className="text-sm text-neutral-500">Select a godown to view stock</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
