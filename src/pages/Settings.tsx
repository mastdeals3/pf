import { useState } from 'react';
import { Building2, Warehouse } from 'lucide-react';
import CompanySettingsTab from './settings/CompanySettingsTab';
import GodownsTab from './settings/GodownsTab';

type SettingsTab = 'company' | 'godowns';

export default function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('company');

  const tabs: { id: SettingsTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'company', label: 'Company Settings', icon: Building2 },
    { id: 'godowns', label: 'Godowns', icon: Warehouse },
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-neutral-50">
      <div className="bg-white border-b border-neutral-100 px-6 py-4">
        <h1 className="text-xl font-bold text-neutral-900">Settings</h1>
        <p className="text-xs text-neutral-500 mt-0.5">Manage company details, warehouse locations, and other configurations</p>
      </div>

      <div className="bg-white border-b border-neutral-200 px-6">
        <div className="flex gap-1">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${
                  isActive
                    ? 'border-primary-600 text-primary-700'
                    : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-primary-600' : 'text-neutral-400'}`} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1">
        {activeTab === 'company' && <CompanySettingsTab />}
        {activeTab === 'godowns' && <GodownsTab />}
      </div>
    </div>
  );
}
