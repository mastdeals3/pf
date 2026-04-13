import { useState } from 'react';
import { Building2, Warehouse, Layers } from 'lucide-react';
import CompanySettingsTab from './settings/CompanySettingsTab';
import CompaniesTab from './settings/CompaniesTab';
import GodownsTab from './settings/GodownsTab';

type SettingsTab = 'companies' | 'company' | 'godowns';

export default function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('companies');

  const tabs: { id: SettingsTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'companies', label: 'Billing Entities', icon: Layers },
    { id: 'company', label: 'Default Settings', icon: Building2 },
    { id: 'godowns', label: 'Godowns', icon: Warehouse },
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-neutral-50">
      <div className="bg-white border-b border-neutral-100 px-5 py-3">
        <h1 className="text-sm font-bold text-neutral-900">Settings</h1>
        <p className="text-[11px] text-neutral-400 mt-0.5">Manage billing entities, company details, warehouse locations</p>
      </div>
      <div className="bg-white border-b border-neutral-200 px-5">
        <div className="flex gap-1">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors -mb-px ${
                  isActive ? 'border-primary-600 text-primary-700' : 'border-transparent text-neutral-500 hover:text-neutral-700'
                }`}>
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-primary-600' : 'text-neutral-400'}`} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex-1">
        {activeTab === 'companies' && <CompaniesTab />}
        {activeTab === 'company' && <CompanySettingsTab />}
        {activeTab === 'godowns' && <GodownsTab />}
      </div>
    </div>
  );
}
