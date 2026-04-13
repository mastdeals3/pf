import { supabase } from './supabase';
import { generateId } from './utils';

export interface Company {
  id: string;
  name: string;
  tagline?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  phone?: string;
  alt_phone?: string;
  email?: string;
  website?: string;
  gstin?: string;
  pan?: string;
  bank_name?: string;
  account_number?: string;
  ifsc_code?: string;
  account_holder?: string;
  upi_id?: string;
  footer_note?: string;
  logo_url?: string;
  is_active: boolean;
  sort_order?: number;
  created_at: string;
  updated_at?: string;
}

export const DEFAULT_COMPANY: Omit<Company, 'id' | 'created_at'> = {
  name: '', tagline: '', address1: '', address2: '',
  city: '', state: '', pincode: '', phone: '', alt_phone: '',
  email: '', website: '', gstin: '', pan: '',
  bank_name: '', account_number: '', ifsc_code: '',
  account_holder: '', upi_id: '', footer_note: '',
  logo_url: '', is_active: true, sort_order: 0,
};

let _cache: Company[] | null = null;
let _cacheTime = 0;

export async function fetchCompanies(force = false): Promise<Company[]> {
  if (!force && _cache && Date.now() - _cacheTime < 60000) return _cache;
  const { data } = await supabase.from('companies').select('*').eq('is_active', true).order('sort_order');
  _cache = (data || []) as Company[];
  _cacheTime = Date.now();
  return _cache;
}

export function invalidateCompaniesCache() { _cache = null; }

export async function getCompanyById(id: string): Promise<Company | null> {
  const companies = await fetchCompanies();
  return companies.find(c => c.id === id) || null;
}

export async function uploadCompanyLogo(companyId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop() || 'png';
  const path = `${companyId}/logo.${ext}`;
  const { error } = await supabase.storage.from('company-logos').upload(path, file, { upsert: true });
  if (error) throw error;
  const { data: { publicUrl } } = supabase.storage.from('company-logos').getPublicUrl(path);
  return publicUrl + `?t=${Date.now()}`; // bust cache
}
