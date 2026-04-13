import { formatDate } from '../../lib/utils';
import { useCompanySettings } from '../../lib/useCompanySettings';
import type { DeliveryChallan } from '../../types';
import type { Company } from '../../lib/companiesService';

interface ChallanPrintProps {
  challan: DeliveryChallan;
  companyOverride?: Company;
}

function joinAddress(parts: (string | undefined | null)[]) {
  return parts.filter(Boolean).join(', ');
}

export default function ChallanPrint({ challan, companyOverride }: ChallanPrintProps) {
  const { company: defaultCompany } = useCompanySettings();
  const company = companyOverride ? {
    name: companyOverride.name,
    tagline: companyOverride.tagline || '',
    address1: companyOverride.address1 || '',
    address2: companyOverride.address2 || '',
    city: companyOverride.city || '',
    state: companyOverride.state || '',
    pincode: companyOverride.pincode || '',
    phone: companyOverride.phone || '',
    email: companyOverride.email || '',
    logo_url: companyOverride.logo_url || '',
  } : { ...defaultCompany, logo_url: '' };

  const companyAddress = joinAddress([
    company.address1, company.address2, company.city, company.state, company.pincode,
  ]);
  const customerAddress = joinAddress([
    challan.customer_address, challan.customer_address2,
    challan.customer_city, challan.customer_state, challan.customer_pincode,
  ]);

  return (
    <div id="challan-print" className="bg-white p-8 max-w-[800px] mx-auto text-neutral-900 font-sans">
      <div className="border-b-2 border-neutral-800 pb-4 mb-5">
        <div className="flex items-start justify-between">
          <div>
            {company.logo_url && <img src={company.logo_url} alt={company.name} className="h-10 w-auto object-contain mb-1" />}
            <h1 className="text-xl font-bold text-neutral-800 tracking-wide">{company.name.toUpperCase()}</h1>
            <p className="text-sm text-neutral-600 font-medium">{company.tagline}</p>
            {companyAddress && <p className="text-xs text-neutral-500 mt-0.5">{companyAddress}</p>}
            {company.phone && <p className="text-xs text-neutral-500">{company.phone}</p>}
          </div>
          <div className="text-right">
            <p className="text-xl font-bold text-neutral-700 uppercase tracking-widest">DELIVERY CHALLAN</p>
            <p className="text-sm font-semibold text-neutral-600 mt-1">#{challan.challan_number}</p>
            <p className="text-xs text-neutral-500">Date: {formatDate(challan.challan_date)}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5 mb-5">
        <div>
          <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-2">Dispatched From</p>
          <div className="bg-neutral-50 rounded-lg p-3">
            <p className="font-semibold">{company.name}</p>
            <p className="text-xs text-neutral-500 mt-1">{company.tagline}</p>
            {companyAddress && <p className="text-xs text-neutral-500 mt-0.5">{companyAddress}</p>}
          </div>
        </div>
        <div>
          <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-2">Dispatched To</p>
          <div className="bg-neutral-50 rounded-lg p-3">
            <p className="font-semibold">{challan.customer_name}</p>
            {challan.customer_phone && <p className="text-xs text-neutral-600 mt-1">{challan.customer_phone}</p>}
            {customerAddress && <p className="text-xs text-neutral-500 mt-0.5">{customerAddress}</p>}
          </div>
        </div>
      </div>

      {/* Dispatch Info */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-neutral-50 rounded-lg p-3">
          <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Mode of Dispatch</p>
          <p className="text-sm font-semibold mt-1">{challan.dispatch_mode || 'Courier'}</p>
        </div>
        {challan.courier_company && (
          <div className="bg-neutral-50 rounded-lg p-3">
            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Courier Company</p>
            <p className="text-sm font-semibold mt-1">{challan.courier_company}</p>
          </div>
        )}
        {challan.tracking_number && (
          <div className="bg-neutral-50 rounded-lg p-3">
            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Tracking Number</p>
            <p className="text-sm font-semibold mt-1">{challan.tracking_number}</p>
          </div>
        )}
      </div>

      {/* Items */}
      <table className="w-full border-collapse mb-5">
        <thead>
          <tr className="bg-neutral-800 text-white">
            <th className="px-3 py-2 text-left text-xs font-semibold w-8">#</th>
            <th className="px-3 py-2 text-left text-xs font-semibold">Item Description</th>
            <th className="px-3 py-2 text-center text-xs font-semibold w-20">Unit</th>
            <th className="px-3 py-2 text-right text-xs font-semibold w-20">Qty</th>
            <th className="px-3 py-2 text-left text-xs font-semibold w-32">Remarks</th>
          </tr>
        </thead>
        <tbody>
          {(challan.items || []).map((item, idx) => (
            <tr key={item.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-neutral-50'}>
              <td className="px-3 py-2.5 text-xs text-neutral-500 border-b border-neutral-100">{idx + 1}</td>
              <td className="px-3 py-2.5 text-sm font-medium text-neutral-900 border-b border-neutral-100">{item.product_name}</td>
              <td className="px-3 py-2.5 text-xs text-center text-neutral-600 border-b border-neutral-100">{item.unit}</td>
              <td className="px-3 py-2.5 text-sm text-right font-semibold border-b border-neutral-100">{item.quantity}</td>
              <td className="px-3 py-2.5 text-xs text-neutral-400 border-b border-neutral-100"></td>
            </tr>
          ))}
        </tbody>
      </table>

      {challan.notes && (
        <div className="bg-neutral-50 rounded-lg p-3 mb-4">
          <p className="text-xs text-neutral-500"><span className="font-medium text-neutral-700">Notes: </span>{challan.notes}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-5 mt-6">
        <div className="border border-neutral-200 rounded-lg p-3">
          <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-4">Receiver's Signature</p>
          <div className="border-t border-neutral-300 pt-2">
            <p className="text-xs text-neutral-500">Name & Date</p>
          </div>
        </div>
        <div className="border border-neutral-200 rounded-lg p-3">
          <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-4">Authorized Signature</p>
          <div className="border-t border-neutral-300 pt-2">
            <p className="text-xs font-semibold text-neutral-700">{company.name}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
