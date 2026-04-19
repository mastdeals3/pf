import { formatDate } from '../../lib/utils';
import { useCompanySettings } from '../../lib/useCompanySettings';
import type { DeliveryChallan } from '../../types';
import type { Company } from '../../lib/companiesService';

interface ChallanPrintProps {
  challan: DeliveryChallan;
  companyOverride?: Company;
  printMode?: 'normal' | 'b2b';
}

function joinAddress(parts: (string | undefined | null)[]) {
  return parts.filter(Boolean).join(', ');
}

export default function ChallanPrint({ challan, companyOverride, printMode = 'normal' }: ChallanPrintProps) {
  const { company: defaultCompany } = useCompanySettings();
  const isB2B = printMode === 'b2b' || !!challan.is_b2b;

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
  const shipToAddress = joinAddress([
    challan.ship_to_address1, challan.ship_to_address2,
    challan.ship_to_city, challan.ship_to_state, challan.ship_to_pin,
  ]);

  const sellerName = isB2B ? challan.customer_name : company.name;
  const sellerAddr = isB2B ? customerAddress : companyAddress;
  const sellerPhone = isB2B ? (challan.customer_phone || '') : company.phone;
  const buyerName = isB2B ? (challan.ship_to_name || '') : challan.customer_name;
  const buyerAddr = isB2B ? shipToAddress : customerAddress;
  const buyerPhone = isB2B ? (challan.ship_to_phone || '') : (challan.customer_phone || '');

  return (
    <div id="challan-print" className="bg-white p-8 max-w-[800px] mx-auto text-neutral-900 font-sans">
      <div className="border-b-2 border-neutral-800 pb-4 mb-5">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            {!isB2B && company.logo_url && <img src={company.logo_url} alt={company.name} className="h-10 w-auto object-contain mb-1" />}
            <div>
              <h1 className="text-xl font-bold text-neutral-800 tracking-wide">{sellerName.toUpperCase()}</h1>
              {!isB2B && company.tagline && <p className="text-sm text-neutral-600 font-medium">{company.tagline}</p>}
              {sellerAddr && <p className="text-xs text-neutral-500 mt-0.5">{sellerAddr}</p>}
              {sellerPhone && <p className="text-xs text-neutral-500">{sellerPhone}</p>}
            </div>
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
          <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-2">{isB2B ? 'Seller' : 'Dispatched From'}</p>
          <div className="bg-neutral-50 rounded-lg p-3">
            <p className="font-semibold">{sellerName}</p>
            {!isB2B && company.tagline && <p className="text-xs text-neutral-500 mt-1">{company.tagline}</p>}
            {sellerAddr && <p className="text-xs text-neutral-500 mt-0.5">{sellerAddr}</p>}
            {sellerPhone && <p className="text-xs text-neutral-500">{sellerPhone}</p>}
          </div>
        </div>
        <div>
          <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-2">{isB2B ? 'Buyer' : 'Dispatched To'}</p>
          <div className={`rounded-lg p-3 ${isB2B ? 'bg-blue-50' : 'bg-neutral-50'}`}>
            <p className="font-semibold">{buyerName}</p>
            {buyerPhone && <p className="text-xs text-neutral-600 mt-1">{buyerPhone}</p>}
            {buyerAddr && <p className="text-xs text-neutral-500 mt-0.5">{buyerAddr}</p>}
          </div>
        </div>
      </div>

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
            <p className="text-xs font-semibold text-neutral-700">{isB2B ? sellerName : company.name}</p>
            {!isB2B && company.tagline && <p className="text-[10px] text-neutral-400">{company.tagline}</p>}
          </div>
        </div>
      </div>

      {isB2B && (
        <div className="mt-4 text-center text-[10px] text-neutral-400 border-t border-neutral-100 pt-3">
          Processed by {company.name}
        </div>
      )}
    </div>
  );
}
