import { useState, useEffect, useRef } from 'react';
import { Plus, Save, Building2, Pencil, Trash2, ImagePlus, CheckCircle, Upload, X, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { uploadCompanyLogo, invalidateCompaniesCache, DEFAULT_COMPANY } from '../../lib/companiesService';
import type { Company } from '../../lib/companiesService';
import { formatCurrency } from '../../lib/utils';

type FormData = Omit<Company, 'id' | 'created_at'>;

const emptyForm = (): FormData => ({ ...DEFAULT_COMPANY, name: '', sort_order: 99 });

export default function CompaniesTab() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | 'new' | null>(null);
  const [editForms, setEditForms] = useState<Record<string, FormData>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => { loadCompanies(); }, []);

  const loadCompanies = async () => {
    const { data } = await supabase.from('companies').select('*').order('sort_order');
    setCompanies((data || []) as Company[]);
    setLoading(false);
  };

  const startEdit = (c: Company) => {
    setEditForms(f => ({ ...f, [c.id]: { ...c } }));
    setExpandedId(c.id);
  };

  const startAdd = () => {
    setEditForms(f => ({ ...f, new: emptyForm() }));
    setExpandedId('new');
  };

  const updateField = (id: string, field: keyof FormData, value: string | boolean | number) => {
    setEditForms(f => ({ ...f, [id]: { ...f[id], [field]: value } }));
    setSaved(null);
  };

  const handleLogoUpload = async (id: string, file: File) => {
    setLogoUploading(id);
    try {
      let companyId = id;
      if (id === 'new') {
        // Need to save first to get an ID — or use a temp path
        companyId = `temp_${Date.now()}`;
      }
      const url = await uploadCompanyLogo(companyId, file);
      setEditForms(f => ({ ...f, [id]: { ...f[id], logo_url: url } }));
    } catch (err) { console.error(err); }
    finally { setLogoUploading(null); }
  };

  const handleSave = async (id: string) => {
    const form = editForms[id];
    if (!form?.name.trim()) return;
    setSaving(id);
    try {
      if (id === 'new') {
        const { data } = await supabase.from('companies').insert({
          ...form, updated_at: new Date().toISOString(),
        }).select().single();
        if (data && form.logo_url?.includes('temp_')) {
          // Re-upload logo with real ID
          // (simplified: just keep the temp URL — it works)
        }
        invalidateCompaniesCache();
        await loadCompanies();
        setExpandedId(null);
        setEditForms(f => { const n = { ...f }; delete n.new; return n; });
      } else {
        await supabase.from('companies').update({
          ...form, updated_at: new Date().toISOString(),
        }).eq('id', id);
        invalidateCompaniesCache();
        await loadCompanies();
        setSaved(id);
        setTimeout(() => setSaved(s => s === id ? null : s), 2500);
      }
    } finally { setSaving(null); }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this company? Products linked to it will be unlinked.')) return;
    await supabase.from('companies').delete().eq('id', id);
    invalidateCompaniesCache();
    await loadCompanies();
    setExpandedId(null);
  };

  const FormSection = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
      <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-2">{label}</p>
      {children}
    </div>
  );

  const renderForm = (id: string) => {
    const form = editForms[id];
    if (!form) return null;
    const f = (field: keyof FormData, v: string) => updateField(id, field, v);
    const isNew = id === 'new';

    return (
      <div className="border-t border-neutral-100 bg-neutral-50 px-5 py-4 space-y-4">
        {/* Logo + Name side by side */}
        <div className="flex gap-4 items-start">
          {/* Logo upload */}
          <div className="shrink-0">
            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1.5">Logo</p>
            <input ref={el => { fileRefs.current[id] = el; }} type="file" accept="image/*" className="hidden"
              onChange={e => { const file = e.target.files?.[0]; if (file) handleLogoUpload(id, file); }} />
            <div
              className="w-20 h-20 rounded-xl border-2 border-dashed border-neutral-200 flex flex-col items-center justify-center cursor-pointer hover:border-primary-400 transition-colors overflow-hidden bg-white relative group"
              onClick={() => fileRefs.current[id]?.click()}
            >
              {form.logo_url ? (
                <>
                  <img src={form.logo_url} alt="logo" className="w-full h-full object-contain p-1" />
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Upload className="w-4 h-4 text-white" />
                  </div>
                </>
              ) : logoUploading === id ? (
                <div className="w-5 h-5 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <ImagePlus className="w-5 h-5 text-neutral-300" />
                  <p className="text-[9px] text-neutral-400 mt-1 text-center px-1">Upload Logo</p>
                </>
              )}
            </div>
          </div>

          {/* Name + Tagline + GSTIN/PAN */}
          <div className="flex-1 grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="label">Company / Entity Name *</label>
              <input value={form.name} onChange={e => f('name', e.target.value)} className="input" placeholder="e.g. Heer or Prachi Fulfagar" />
            </div>
            <div className="col-span-2">
              <label className="label">Tagline / Designation</label>
              <input value={form.tagline || ''} onChange={e => f('tagline', e.target.value)} className="input" placeholder="Healing & Spiritual Products" />
            </div>
            <div>
              <label className="label">GSTIN</label>
              <input value={form.gstin || ''} onChange={e => f('gstin', e.target.value)} className="input" placeholder="22AAAAA0000A1Z5" />
            </div>
            <div>
              <label className="label">PAN</label>
              <input value={form.pan || ''} onChange={e => f('pan', e.target.value)} className="input" placeholder="AAAAA0000A" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormSection label="Address">
            <div className="space-y-2">
              <input value={form.address1 || ''} onChange={e => f('address1', e.target.value)} className="input" placeholder="Address Line 1" />
              <input value={form.address2 || ''} onChange={e => f('address2', e.target.value)} className="input" placeholder="Address Line 2" />
              <div className="grid grid-cols-3 gap-1.5">
                <input value={form.city || ''} onChange={e => f('city', e.target.value)} className="input" placeholder="City" />
                <input value={form.state || ''} onChange={e => f('state', e.target.value)} className="input" placeholder="State" />
                <input value={form.pincode || ''} onChange={e => f('pincode', e.target.value)} className="input" placeholder="PIN" maxLength={6} />
              </div>
            </div>
          </FormSection>

          <FormSection label="Contact">
            <div className="space-y-2">
              <input value={form.phone || ''} onChange={e => f('phone', e.target.value)} className="input" placeholder="Primary Phone" />
              <input value={form.alt_phone || ''} onChange={e => f('alt_phone', e.target.value)} className="input" placeholder="Alternate Phone" />
              <input type="email" value={form.email || ''} onChange={e => f('email', e.target.value)} className="input" placeholder="Email" />
              <input value={form.website || ''} onChange={e => f('website', e.target.value)} className="input" placeholder="Website" />
            </div>
          </FormSection>
        </div>

        <FormSection label="Bank & Payment">
          <div className="grid grid-cols-3 gap-2">
            <input value={form.bank_name || ''} onChange={e => f('bank_name', e.target.value)} className="input" placeholder="Bank Name" />
            <input value={form.account_holder || ''} onChange={e => f('account_holder', e.target.value)} className="input" placeholder="Account Holder" />
            <input value={form.account_number || ''} onChange={e => f('account_number', e.target.value)} className="input" placeholder="Account Number" />
            <input value={form.ifsc_code || ''} onChange={e => f('ifsc_code', e.target.value)} className="input" placeholder="IFSC Code" />
            <input value={form.upi_id || ''} onChange={e => f('upi_id', e.target.value)} className="input" placeholder="UPI ID" />
          </div>
        </FormSection>

        <div>
          <label className="label">Invoice Footer Note</label>
          <textarea value={form.footer_note || ''} onChange={e => f('footer_note', e.target.value)} className="input resize-none h-14" placeholder="Thank you message on invoices..." />
        </div>

        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            {!isNew && (
              <button onClick={() => handleDelete(id)} className="btn-ghost text-error-600 hover:bg-error-50 text-xs">
                <Trash2 className="w-3 h-3" /> Delete
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { setExpandedId(null); if (isNew) setEditForms(f => { const n={...f}; delete n.new; return n; }); }} className="btn-secondary text-xs">
              Cancel
            </button>
            <button onClick={() => handleSave(id)} disabled={saving === id || !form.name.trim()} className="btn-primary text-xs">
              {saving === id ? 'Saving...' : saved === id ? <><CheckCircle className="w-3 h-3" /> Saved</> : <><Save className="w-3 h-3" /> {isNew ? 'Create Company' : 'Save Changes'}</>}
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="p-5 max-w-3xl space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-neutral-800">Billing Entities</p>
          <p className="text-xs text-neutral-400 mt-0.5">Each company appears as the "Bill From" on invoices for its products</p>
        </div>
        <button onClick={startAdd} className="btn-primary text-xs"><Plus className="w-3.5 h-3.5" /> Add Company</button>
      </div>

      {/* New company form */}
      {expandedId === 'new' && (
        <div className="bg-white rounded-xl border-2 border-primary-200 shadow-card overflow-hidden">
          <div className="px-5 py-3 flex items-center gap-2">
            <div className="w-7 h-7 bg-primary-50 rounded-lg flex items-center justify-center">
              <Building2 className="w-4 h-4 text-primary-600" />
            </div>
            <p className="text-sm font-semibold text-neutral-800">New Company</p>
          </div>
          {renderForm('new')}
        </div>
      )}

      {/* Existing companies */}
      {companies.map(c => (
        <div key={c.id} className="bg-white rounded-xl border border-neutral-100 shadow-card overflow-hidden">
          <div
            className="px-5 py-3 flex items-center gap-3 cursor-pointer hover:bg-neutral-50 transition-colors"
            onClick={() => {
              if (expandedId === c.id) { setExpandedId(null); }
              else { startEdit(c); }
            }}
          >
            {c.logo_url ? (
              <img src={c.logo_url} alt={c.name} className="w-9 h-9 object-contain rounded-lg border border-neutral-100 bg-white shrink-0" />
            ) : (
              <div className="w-9 h-9 bg-primary-50 rounded-lg flex items-center justify-center shrink-0">
                <Building2 className="w-4 h-4 text-primary-600" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-neutral-900">{c.name}</p>
              {c.tagline && <p className="text-[11px] text-neutral-400 truncate">{c.tagline}</p>}
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {c.gstin && <span className="text-[10px] bg-neutral-100 text-neutral-500 px-2 py-0.5 rounded font-mono">{c.gstin}</span>}
              {expandedId === c.id ? <ChevronUp className="w-4 h-4 text-neutral-400" /> : <ChevronDown className="w-4 h-4 text-neutral-400" />}
            </div>
          </div>
          {expandedId === c.id && renderForm(c.id)}
        </div>
      ))}

      {companies.length === 0 && expandedId !== 'new' && (
        <div className="text-center py-10 text-neutral-400 text-sm">No companies yet. Add your first billing entity.</div>
      )}
    </div>
  );
}
