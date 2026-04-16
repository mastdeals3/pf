import { supabase } from '../lib/supabase';
import { nextDocNumber } from '../lib/utils';
import type { Invoice } from '../types';

export async function fetchInvoices(filters?: { status?: string; customerId?: string }): Promise<Invoice[]> {
  let query = supabase
    .from('invoices')
    .select('*, items:invoice_items(*)')
    .order('created_at', { ascending: false });
  if (filters?.status) query = query.eq('status', filters.status);
  if (filters?.customerId) query = query.eq('customer_id', filters.customerId);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as Invoice[];
}

export async function fetchInvoiceById(id: string): Promise<Invoice | null> {
  const { data } = await supabase
    .from('invoices')
    .select('*, items:invoice_items(*)')
    .eq('id', id)
    .maybeSingle();
  return data as Invoice | null;
}

export async function createInvoice(
  invoice: Partial<Invoice>,
  items: { product_id: string; product_name: string; quantity: number; rate: number; total_price: number; unit?: string; hsn_code?: string }[]
): Promise<{ invoice: Invoice; errors: string[] }> {
  const invoice_number = await nextDocNumber('INV', supabase);
  const { data, error } = await supabase
    .from('invoices')
    .insert({ ...invoice, invoice_number })
    .select()
    .single();
  if (error) throw error;

  if (items.length) {
    await supabase.from('invoice_items').insert(
      items.map(item => ({ ...item, invoice_id: data.id }))
    );
  }

  return { invoice: data as Invoice, errors: [] };
}


export async function recordPayment(
  invoiceId: string,
  amount: number,
  mode: string,
  date: string,
  notes?: string
): Promise<void> {
  const { data: invoice } = await supabase
    .from('invoices')
    .select('customer_id, customer_name, total_amount, paid_amount, outstanding_amount, sales_order_id, invoice_number')
    .eq('id', invoiceId)
    .maybeSingle();
  if (!invoice) throw new Error('Invoice not found');

  // Generate a unique payment number
  const seq = Math.floor(Math.random() * 900000) + 100000;
  const paymentNumber = `PAY-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${seq}`;

  const { data: paymentRow, error } = await supabase.from('payments').insert({
    payment_number: paymentNumber,
    invoice_id: invoiceId,
    reference_type: 'invoice',
    reference_id: invoiceId,
    customer_id: invoice.customer_id,
    party_name: invoice.customer_name ?? '',
    amount,
    payment_mode: mode,
    payment_date: date,
    notes: notes ?? '',
    payment_type: 'receipt',
  }).select().single();

  if (error) throw error;

  // Trigger post-payment workflow (update invoice status + ledger)
  if (paymentRow) {
    const { onPaymentCreated } = await import('./workflowService');
    await onPaymentCreated(paymentRow.id);
  }
}
