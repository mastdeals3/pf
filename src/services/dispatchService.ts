import { supabase } from '../lib/supabase';
import { nextDocNumber } from '../lib/utils';
import type { Dispatch } from '../types';

export async function fetchDispatches(): Promise<Dispatch[]> {
  const { data, error } = await supabase
    .from('dispatches')
    .select('*, sales_order:sales_orders(so_number), invoice:invoices(invoice_number)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as Dispatch[];
}

export async function createDispatch(payload: Omit<Dispatch, 'id' | 'created_at' | 'dispatch_number'>): Promise<Dispatch> {
  const dispatch_number = await nextDocNumber('DSP', supabase);
  const { data, error } = await supabase
    .from('dispatches')
    .insert({ ...payload, dispatch_number })
    .select()
    .single();
  if (error) throw error;

  if (payload.sales_order_id) {
    await supabase
      .from('sales_orders')
      .update({ status: 'dispatched', updated_at: new Date().toISOString() })
      .eq('id', payload.sales_order_id);
  }

  return data as Dispatch;
}

export async function updateDispatchStatus(id: string, status: Dispatch['status']): Promise<void> {
  const { error } = await supabase
    .from('dispatches')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}


export async function getDispatchesForOrder(salesOrderId: string): Promise<Dispatch[]> {
  const { data, error } = await supabase
    .from('dispatches')
    .select('*')
    .eq('sales_order_id', salesOrderId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as Dispatch[];
}
