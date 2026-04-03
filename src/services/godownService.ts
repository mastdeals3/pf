import { supabase } from '../lib/supabase';
import type { Godown, GodownStock } from '../types';

export async function fetchGodowns(): Promise<Godown[]> {
  const { data, error } = await supabase
    .from('godowns')
    .select('*')
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return data || [];
}

export async function fetchGodownStock(productId?: string): Promise<GodownStock[]> {
  let query = supabase
    .from('godown_stock')
    .select('*, product:products(id, name, sku, unit, category, purchase_price, selling_price, low_stock_alert), godown:godowns(id, name, code, location)');
  if (productId) query = query.eq('product_id', productId);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as GodownStock[];
}

export async function fetchStockForGodown(godownId: string): Promise<GodownStock[]> {
  const { data, error } = await supabase
    .from('godown_stock')
    .select('*, product:products(id, name, sku, unit, selling_price, low_stock_alert)')
    .eq('godown_id', godownId)
    .gt('quantity', 0);
  if (error) throw error;
  return (data || []) as GodownStock[];
}

export async function getGodownStockForProduct(productId: string, godownId: string): Promise<number> {
  const { data } = await supabase
    .from('godown_stock')
    .select('quantity')
    .eq('product_id', productId)
    .eq('godown_id', godownId)
    .maybeSingle();
  return data?.quantity || 0;
}

export async function reduceGodownStock(
  productId: string,
  godownId: string,
  quantity: number
): Promise<{ error: string | null }> {
  const current = await getGodownStockForProduct(productId, godownId);
  if (current < quantity) {
    return { error: `Insufficient stock. Available: ${current}` };
  }
  const { error } = await supabase
    .from('godown_stock')
    .upsert({
      product_id: productId,
      godown_id: godownId,
      quantity: current - quantity,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'godown_id,product_id' });
  return { error: error?.message || null };
}

export async function addGodownStock(
  productId: string,
  godownId: string,
  quantity: number
): Promise<void> {
  const current = await getGodownStockForProduct(productId, godownId);
  await supabase
    .from('godown_stock')
    .upsert({
      product_id: productId,
      godown_id: godownId,
      quantity: current + quantity,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'godown_id,product_id' });
}

export async function createGodown(data: Partial<Godown>): Promise<Godown> {
  const { data: created, error } = await supabase
    .from('godowns')
    .insert(data)
    .select()
    .single();
  if (error) throw error;
  return created;
}

export async function updateGodown(id: string, data: Partial<Godown>): Promise<void> {
  const { error } = await supabase.from('godowns').update(data).eq('id', id);
  if (error) throw error;
}
