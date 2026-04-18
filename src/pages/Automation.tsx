import { useState, useEffect } from 'react';
import { Plus, Zap, ToggleLeft, ToggleRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import Modal from '../components/ui/Modal';
import ActionMenu, { actionEdit, actionDelete } from '../components/ui/ActionMenu';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import type { AutomationRule } from '../types';

const TRIGGER_EVENTS = [
  'invoice_created', 'payment_received', 'payment_overdue', 'stock_low', 'appointment_scheduled'
];
const ACTION_TYPES = [
  'send_whatsapp', 'send_email', 'create_reminder', 'update_status'
];

export default function Automation() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);
  const [confirmRule, setConfirmRule] = useState<AutomationRule | null>(null);
  const [form, setForm] = useState({ name: '', trigger_event: 'invoice_created', action_type: 'send_whatsapp', is_active: true });

  useEffect(() => { loadRules(); }, []);

  const loadRules = async () => {
    const { data } = await supabase.from('automation_rules').select('*').order('created_at', { ascending: false });
    setRules(data || []);
  };

  const openAdd = () => {
    setEditingRule(null);
    setForm({ name: '', trigger_event: 'invoice_created', action_type: 'send_whatsapp', is_active: true });
    setShowModal(true);
  };

  const openEdit = (rule: AutomationRule) => {
    setEditingRule(rule);
    setForm({
      name: rule.name,
      trigger_event: rule.trigger_event,
      action_type: rule.action_type,
      is_active: rule.is_active,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (editingRule) {
      await supabase.from('automation_rules').update({
        name: form.name,
        trigger_event: form.trigger_event,
        action_type: form.action_type,
        is_active: form.is_active,
        updated_at: new Date().toISOString(),
      }).eq('id', editingRule.id);
    } else {
      await supabase.from('automation_rules').insert({
        name: form.name, trigger_event: form.trigger_event,
        action_type: form.action_type, action_config: {}, is_active: form.is_active,
      });
    }
    setShowModal(false);
    loadRules();
  };

  const handleDelete = async (rule: AutomationRule) => {
    await supabase.from('automation_rules').delete().eq('id', rule.id);
    loadRules();
  };

  const toggleRule = async (rule: AutomationRule) => {
    await supabase.from('automation_rules').update({ is_active: !rule.is_active }).eq('id', rule.id);
    loadRules();
  };

  const formatTrigger = (t: string) => t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  const presetRules = [
    { trigger: 'Invoice Created', action: 'Send WhatsApp notification to customer', active: true, icon: '📄' },
    { trigger: 'Payment Overdue', action: 'Send payment reminder via WhatsApp', active: true, icon: '⏰' },
    { trigger: 'Stock Low', action: 'Notify admin of low inventory', active: false, icon: '📦' },
    { trigger: 'Appointment Scheduled', action: 'Send appointment confirmation', active: true, icon: '📅' },
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-neutral-50">
      <div className="bg-white border-b border-neutral-100 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Automation</h1>
          <p className="text-xs text-neutral-500 mt-0.5">Configure rule-based automations for your business</p>
        </div>
        <button onClick={openAdd} className="btn-primary">
          <Plus className="w-4 h-4" /> New Rule
        </button>
      </div>

      <div className="p-6 space-y-5">
        <div className="bg-primary-50 border border-primary-100 rounded-xl p-4 flex items-start gap-3">
          <Zap className="w-5 h-5 text-primary-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-primary-800">Automation Engine</p>
            <p className="text-xs text-primary-600 mt-0.5">Create rules that automatically trigger actions when specific events occur in your business. Connect with WhatsApp, email, and reminders.</p>
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold text-neutral-800 mb-3">Suggested Automations</p>
          <div className="grid grid-cols-2 gap-3">
            {presetRules.map((rule, i) => (
              <div key={i} className="card flex items-start gap-3">
                <div className="w-8 h-8 bg-neutral-100 rounded-lg flex items-center justify-center text-base shrink-0">{rule.icon}</div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-neutral-900">{rule.trigger}</p>
                  <p className="text-xs text-neutral-500 mt-0.5">{rule.action}</p>
                </div>
                <div className={`w-2 h-2 rounded-full mt-1 ${rule.active ? 'bg-success-500' : 'bg-neutral-300'}`} />
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold text-neutral-800 mb-3">Custom Rules</p>
          {rules.length === 0 ? (
            <div className="card text-center py-10">
              <Zap className="w-8 h-8 text-neutral-300 mx-auto mb-2" />
              <p className="text-sm text-neutral-500">No custom rules yet</p>
              <p className="text-xs text-neutral-400 mt-0.5">Create your first automation rule</p>
            </div>
          ) : (
            <div className="space-y-2">
              {rules.map(rule => (
                <div key={rule.id} className="card flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${rule.is_active ? 'bg-primary-100' : 'bg-neutral-100'}`}>
                    <Zap className={`w-4 h-4 ${rule.is_active ? 'text-primary-600' : 'text-neutral-400'}`} />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-neutral-900">{rule.name}</p>
                    <p className="text-xs text-neutral-500">
                      When: <span className="text-primary-600">{formatTrigger(rule.trigger_event)}</span>
                      {' → '}
                      <span className="text-blue-600">{formatTrigger(rule.action_type)}</span>
                    </p>
                  </div>
                  <button onClick={() => toggleRule(rule)} className="text-neutral-400 hover:text-primary-600 transition-colors">
                    {rule.is_active ? <ToggleRight className="w-6 h-6 text-primary-600" /> : <ToggleLeft className="w-6 h-6 text-neutral-400" />}
                  </button>
                  <ActionMenu items={[
                    actionEdit(() => openEdit(rule)),
                    actionDelete(() => setConfirmRule(rule)),
                  ]} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingRule ? 'Edit Automation Rule' : 'Create Automation Rule'} size="sm"
        footer={
          <>
            <button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleSave} className="btn-primary">{editingRule ? 'Update Rule' : 'Create Rule'}</button>
          </>
        }>
        <div className="space-y-3">
          <div>
            <label className="label">Rule Name *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input" placeholder="e.g., Invoice Notification" />
          </div>
          <div>
            <label className="label">When (Trigger)</label>
            <select value={form.trigger_event} onChange={e => setForm(f => ({ ...f, trigger_event: e.target.value }))} className="input">
              {TRIGGER_EVENTS.map(t => <option key={t} value={t}>{formatTrigger(t)}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Then (Action)</label>
            <select value={form.action_type} onChange={e => setForm(f => ({ ...f, action_type: e.target.value }))} className="input">
              {ACTION_TYPES.map(a => <option key={a} value={a}>{formatTrigger(a)}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="active" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} className="w-4 h-4 accent-primary-600" />
            <label htmlFor="active" className="text-sm text-neutral-700">Enable rule immediately</label>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!confirmRule}
        onClose={() => setConfirmRule(null)}
        onConfirm={() => confirmRule && handleDelete(confirmRule)}
        title="Delete Automation Rule"
        message={`Delete rule "${confirmRule?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        isDanger
      />
    </div>
  );
}
