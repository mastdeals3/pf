import { supabase } from '../lib/supabase';
import { updateLastRate } from '../lib/rateCardService';
import { nextDocNumber } from '../lib/utils';
import type { SalesOrder } from '../types';

export async function fetchSalesOrders(filters?: { status?: string; customerId?: string }): Promise<SalesOrder[]> {
  let query = supabase
    .from('sales_orders')
    .select('*, items:sales_order_items(*), customer:customers(id, name, phone, city)')
    .order('created_at', { ascending: false });
  if (filters?.status) query = query.eq('status', filters.status);
  if (filters?.customerId) query = query.eq('customer_id', filters.customerId);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as SalesOrder[];
}

export async function fetchSalesOrderById(id: string): Promise<SalesOrder | null> {
  const { data } = await supabase
    .from('sales_orders')
    .select('*, items:sales_order_items(*), customer:customers(id, name, phone, city)')
    .eq('id', id)
    .maybeSingle();
  return data as SalesOrder | null;
}

export async function createSalesOrder(
  order: Partial<SalesOrder>,
  items: { product_id: string; product_name: string; quantity: number; rate: number; total_price: number; unit?: string }[]
): Promise<SalesOrder> {
  const so_number = await nextDocNumber('SO', supabase);
  const { data, error } = await supabase
    .from('sales_orders')
    .insert({ ...order, so_number, status: order.status || 'draft' })
    .select()
    .single();
  if (error) throw error;

  if (items.length) {
    await supabase.from('sales_order_items').insert(
      items.map(item => ({ ...item, sales_order_id: data.id }))
    );
  }

  if (order.customer_id) {
    for (const i of items) {
      await updateLastRate(order.customer_id, i.product_id, i.rate, 'sales_order', data.id);
    }
  }

  return data as SalesOrder;
}

export async function updateSalesOrder(
  id: string,
  order: Partial<SalesOrder>,
  items?: { product_id: string; product_name: string; quantity: number; rate: number; total_price: number; unit?: string }[]
): Promise<void> {
  await supabase.from('sales_orders').update({ ...order, updated_at: new Date().toISOString() }).eq('id', id);
  if (items) {
    await supabase.from('sales_order_items').delete().eq('sales_order_id', id);
    if (items.length) {
      await supabase.from('sales_order_items').insert(items.map(item => ({ ...item, sales_order_id: id })));
    }
  }
}

export async function updateSalesOrderStatus(id: string, status: SalesOrder['status']): Promise<void> {
  await supabase.from('sales_orders').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
}

