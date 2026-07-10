import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { 
  Settings, Users, ShieldAlert, FileText, 
  Mail, Save, Plus, HelpCircle 
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

const SettingsPage: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'users' | 'company' | 'vendors' | 'templates' | 'smtp'>('users');
  const [loading, setLoading] = useState(false);

  // Users lists
  const [users, setUsers] = useState<any[]>([]);
  const [newUser, setNewUser] = useState({ email: '', password: '', role: 'AUCTION_OWNER' });

  // Company parameters
  const [company, setCompany] = useState<any>(null);

  // Vendor master parameters
  const [vendors, setVendors] = useState<any[]>([]);
  const [newVendor, setNewVendor] = useState({ name: '', email: '' });

  // Document templates parameters
  const [templates, setTemplates] = useState<any[]>([]);
  const [newTemplate, setNewTemplate] = useState({ type: 'TERMS', content: '' });

  // SMTP diagnostics parameters
  const [smtp, setSmtp] = useState({ host: 'smtp.blackboxlimited.com', port: '587', username: '', password: '' });
  const [smtpStatus, setSmtpStatus] = useState<string | null>(null);

  const fetchUsers = async () => {
    try {
      const res = await axios.get(`${API_URL}/settings/users`);
      setUsers(res.data.data);
    } catch (err) { console.error(err); }
  };

  const fetchCompany = async () => {
    try {
      const res = await axios.get(`${API_URL}/settings/company`);
      setCompany(res.data.data);
    } catch (err) { console.error(err); }
  };

  const fetchVendors = async () => {
    try {
      const res = await axios.get(`${API_URL}/settings/vendors`);
      setVendors(res.data.data);
    } catch (err) { console.error(err); }
  };

  const fetchTemplates = async () => {
    try {
      const res = await axios.get(`${API_URL}/settings/templates`);
      setTemplates(res.data.data);
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    if (activeSubTab === 'users') fetchUsers();
    if (activeSubTab === 'company') fetchCompany();
    if (activeSubTab === 'vendors') fetchVendors();
    if (activeSubTab === 'templates') fetchTemplates();
  }, [activeSubTab]);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post(`${API_URL}/settings/users`, newUser);
      alert('User added successfully!');
      setNewUser({ email: '', password: '', role: 'AUCTION_OWNER' });
      fetchUsers();
    } catch (err) { alert('Failed to invite user'); }
  };

  const handleUpdateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.patch(`${API_URL}/settings/company`, company);
      alert('Company default settings updated!');
    } catch (err) { alert('Failed to update company'); }
  };

  const handleAddVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post(`${API_URL}/settings/vendors`, newVendor);
      alert('Vendor successfully added to Master directory!');
      setNewVendor({ name: '', email: '' });
      fetchVendors();
    } catch (err) { alert('Failed to add vendor'); }
  };

  const handleAddTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post(`${API_URL}/settings/templates`, newTemplate);
      alert('Compliance template version saved successfully!');
      setNewTemplate({ type: 'TERMS', content: '' });
      fetchTemplates();
    } catch (err) { alert('Failed to save template'); }
  };

  const handleTestSMTP = async () => {
    setSmtpStatus('Running SMTP diagnosis...');
    try {
      const res = await axios.post(`${API_URL}/settings/smtp/test`, smtp);
      setSmtpStatus(res.data.message);
    } catch (err) {
      setSmtpStatus('SMTP diagnostics check failed.');
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white flex items-center gap-2 font-sans">
          <Settings size={20} className="text-indigo-650" />
          Settings Portal
        </h1>
        <p className="text-xs text-neutral-500 mt-1">
          Configure default company parameters, user scopes, vendor master files, and mail connections.
        </p>
      </div>

      {/* Tabs list */}
      <div className="flex border-b border-neutral-200 dark:border-slate-800 gap-4 text-xs font-semibold">
        {[
          { id: 'users', label: 'Users & RBAC', icon: Users },
          { id: 'company', label: 'Company Profile', icon: Settings },
          { id: 'vendors', label: 'Vendor Directory', icon: ShieldAlert },
          { id: 'templates', label: 'Document Templates', icon: FileText },
          { id: 'smtp', label: 'SMTP Config', icon: Mail },
        ].map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              className={`pb-2.5 px-1 flex items-center gap-1.5 transition border-b-2 ${
                activeSubTab === tab.id
                  ? 'border-b-2 border-indigo-650 text-indigo-655 font-bold'
                  : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-white'
              }`}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Configuration Cards panels */}
      <div className="bg-white dark:bg-slate-900 border border-neutral-200 dark:border-slate-800 p-6 rounded-2xl shadow-sm text-xs space-y-6">
        
        {/* USERS list & invite */}
        {activeSubTab === 'users' && (
          <div className="space-y-6">
            <form onSubmit={handleAddUser} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-neutral-100 dark:border-slate-900">
              <div>
                <label className="block text-[10px] font-bold text-neutral-500 mb-1.5">User Email</label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser(p => ({ ...p, email: e.target.value }))}
                  placeholder="e.g. buyer@company.com"
                  className="w-full border border-neutral-200 rounded-xl p-2 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-neutral-500 mb-1.5">Password</label>
                <input
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser(p => ({ ...p, password: e.target.value }))}
                  placeholder="Enter initial password..."
                  className="w-full border border-neutral-200 rounded-xl p-2 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-neutral-500 mb-1.5">RBAC Role</label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser(p => ({ ...p, role: e.target.value }))}
                  className="w-full border border-neutral-200 rounded-xl p-2 bg-white focus:outline-none"
                >
                  <option value="AUCTION_OWNER">Auction Owner (Buyer)</option>
                  <option value="APPROVER">Supervisor Approver</option>
                  <option value="OBSERVER">Observer Scopes</option>
                </select>
              </div>
              <button
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-xl h-[2.35rem]"
              >
                Invite User
              </button>
            </form>

            <div className="border rounded-xl overflow-hidden divide-y divide-neutral-100 dark:divide-slate-800">
              {users.map((u) => (
                <div key={u.id} className="p-3.5 flex justify-between items-center hover:bg-slate-50/50">
                  <div>
                    <p className="font-semibold text-neutral-850 dark:text-neutral-200">{u.email}</p>
                    <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider mt-0.5">{u.role}</p>
                  </div>
                  <span className="text-[10px] text-neutral-500">Joined: {new Date(u.createdAt).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* COMPANY default details profile */}
        {activeSubTab === 'company' && company && (
          <form onSubmit={handleUpdateCompany} className="space-y-4 max-w-md">
            <div>
              <label className="block text-[10px] font-bold text-neutral-500 mb-1.5">Company Name</label>
              <input
                type="text"
                value={company.name}
                onChange={(e) => setCompany({ ...company, name: e.target.value })}
                className="w-full border border-neutral-200 rounded-xl p-2 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-neutral-500 mb-1.5">Primary Branding Hex Color</label>
              <input
                type="text"
                value={company.primaryColor || '#0B2447'}
                onChange={(e) => setCompany({ ...company, primaryColor: e.target.value })}
                className="w-full border border-neutral-200 rounded-xl p-2 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="bg-indigo-650 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-xl flex items-center gap-1.5"
            >
              <Save size={13} />
              Save Preferences
            </button>
          </form>
        )}

        {/* VENDORS master list */}
        {activeSubTab === 'vendors' && (
          <div className="space-y-6">
            <form onSubmit={handleAddVendor} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-neutral-100 dark:border-slate-900">
              <div>
                <label className="block text-[10px] font-bold text-neutral-500 mb-1.5">Supplier Name</label>
                <input
                  type="text"
                  value={newVendor.name}
                  onChange={(e) => setNewVendor(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Acme Components"
                  className="w-full border border-neutral-200 rounded-xl p-2 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-neutral-500 mb-1.5">Official email</label>
                <input
                  type="email"
                  value={newVendor.email}
                  onChange={(e) => setNewVendor(p => ({ ...p, email: e.target.value }))}
                  placeholder="e.g. contact@acme.com"
                  className="w-full border border-neutral-200 rounded-xl p-2 focus:outline-none"
                  required
                />
              </div>
              <button
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-xl h-[2.35rem]"
              >
                Add Supplier Master
              </button>
            </form>

            <div className="border rounded-xl overflow-hidden divide-y divide-neutral-100 dark:divide-slate-800">
              {vendors.map((v) => (
                <div key={v.id} className="p-3.5 flex justify-between items-center hover:bg-slate-50/50">
                  <div>
                    <p className="font-semibold text-neutral-850 dark:text-neutral-200">{v.name}</p>
                    <p className="text-[10px] text-neutral-500 font-mono mt-0.5">{v.email}</p>
                  </div>
                  <span className="text-[10px] text-neutral-500">Master database index</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* DOCUMENT TEMPLATES version listings */}
        {activeSubTab === 'templates' && (
          <div className="space-y-6">
            <form onSubmit={handleAddTemplate} className="space-y-4 max-w-lg bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-neutral-100 dark:border-slate-900">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-neutral-500 mb-1.5">Template Scope Category</label>
                  <select
                    value={newTemplate.type}
                    onChange={(e) => setNewTemplate(p => ({ ...p, type: e.target.value }))}
                    className="w-full border border-neutral-200 rounded-xl p-2 bg-white focus:outline-none"
                  >
                    <option value="TERMS">Terms & Conditions</option>
                    <option value="DISCLOSURE">Compliance Disclosures</option>
                    <option value="RULES">Auction Bidding Rules</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-neutral-500 mb-1.5">Rich Text Content agreements</label>
                <textarea
                  rows={4}
                  value={newTemplate.content}
                  onChange={(e) => setNewTemplate(p => ({ ...p, content: e.target.value }))}
                  placeholder="Enter full legal document text templates..."
                  className="w-full border border-neutral-200 rounded-xl p-2 bg-white focus:outline-none"
                  required
                />
              </div>
              <button
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-xl"
              >
                Create Template Version
              </button>
            </form>

            <div className="border rounded-xl overflow-hidden divide-y divide-neutral-100 dark:divide-slate-800">
              {templates.map((t) => (
                <div key={t.id} className="p-3.5 flex justify-between items-center hover:bg-slate-50/50">
                  <div>
                    <p className="font-semibold text-neutral-850 dark:text-neutral-200">{t.type} Template</p>
                    <p className="text-[10px] text-neutral-500 font-bold uppercase mt-0.5">Version tag: v{t.version}</p>
                  </div>
                  <span className="text-[10px] text-neutral-450 italic font-mono truncate max-w-xs">{t.content}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SMTP diagnostics tests */}
        {activeSubTab === 'smtp' && (
          <div className="space-y-4 max-w-md">
            <div>
              <label className="block text-[10px] font-bold text-neutral-500 mb-1.5">SMTP Host Server</label>
              <input
                type="text"
                value={smtp.host}
                onChange={(e) => setSmtp({ ...smtp, host: e.target.value })}
                className="w-full border border-neutral-200 rounded-xl p-2 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-neutral-500 mb-1.5">SMTP Port</label>
              <input
                type="text"
                value={smtp.port}
                onChange={(e) => setSmtp({ ...smtp, port: e.target.value })}
                className="w-full border border-neutral-200 rounded-xl p-2 focus:outline-none"
              />
            </div>
            <button
              onClick={handleTestSMTP}
              className="bg-indigo-650 hover:bg-indigo-750 text-white font-semibold py-2 px-4 rounded-xl"
            >
              Test Connection SMTP diagnostics
            </button>

            {smtpStatus && (
              <div className="p-4 bg-slate-50 dark:bg-slate-950/60 rounded-xl border text-[11px] leading-relaxed text-indigo-600 font-mono">
                {smtpStatus}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};

export default SettingsPage;
