import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../providers/AuthProvider';
import { 
  LayoutDashboard, Gavel, BarChart3, History, Settings, 
  LogOut, Bell, Search, Sun, Moon 
} from 'lucide-react';
import BlackBoxLogo from '../components/BlackBoxLogo';

const Layout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Notifications state
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(true);
  const [notifications, setNotifications] = useState([
    { id: 1, title: 'Cisco Catalyst Switch Procurement - Q3 FY26 is LIVE', desc: 'Authoritative e-auction session started.', time: '10 mins ago', read: false },
    { id: 2, title: 'Compliance acceptances received', desc: 'Supplier Alpha accepted terms gateway details for Cisco Catalyst Switch Procurement.', time: '25 mins ago', read: false },
    { id: 3, title: 'Dell PowerEdge Server Refresh - Gurugram DC is PENDING_APPROVAL', desc: 'Awaiting Approver acceptance and release.', time: '1 hr ago', read: false },
    { id: 4, title: 'Annual Maintenance Contract - Network Devices FY26 is COMPLETED', desc: 'Bidding window closed successfully.', time: 'Yesterday', read: true }
  ]);

  // Read saved theme context on mount - default to dark mode for unified styling
  const [isLightTheme, setIsLightTheme] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved) return saved === 'light';
    return false; // Default to dark mode
  });

  useEffect(() => {
    // Overwrite old light theme saved settings once to align with new dark branding rules
    const hasUpgraded = localStorage.getItem('theme_upgraded');
    if (!hasUpgraded) {
      setIsLightTheme(false);
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
      localStorage.setItem('theme_upgraded', 'true');
      return;
    }

    if (isLightTheme) {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    } else {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    }
  }, [isLightTheme]);

  const toggleTheme = () => {
    setIsLightTheme(!isLightTheme);
  };

  const handleLogout = () => {
    logout();
    navigate('/admin/login');
  };

  const navItems = [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['SYSTEM_ADMIN', 'AUCTION_OWNER', 'APPROVER', 'OBSERVER'] },
    { to: '/auctions', label: 'Auctions', icon: Gavel, roles: ['SYSTEM_ADMIN', 'AUCTION_OWNER', 'APPROVER', 'OBSERVER'] },
    { to: '/reports', label: 'Reports', icon: BarChart3, roles: ['SYSTEM_ADMIN', 'AUCTION_OWNER', 'APPROVER', 'OBSERVER'] },
    { to: '/audit-trail', label: 'Audit Trail', icon: History, roles: ['SYSTEM_ADMIN', 'AUCTION_OWNER'] },
    { to: '/settings', label: 'Settings', icon: Settings, roles: ['SYSTEM_ADMIN', 'AUCTION_OWNER'] },
  ];

  const allowedNav = navItems.filter(item => user && item.roles.includes(user.role));

  return (
    <div className={`flex h-screen w-screen overflow-hidden font-body transition-colors duration-500 ${
      isLightTheme ? 'bg-[#F5F7FA] text-[#0F172A]' : 'bg-[#070708] text-neutral-200'
    }`}>
      
      {/* Sidebar */}
      <aside className={`hidden md:flex md:w-64 flex-col justify-between p-4 border-r transition-colors duration-500 ${
        isLightTheme ? 'bg-white border-zinc-200 text-[#0F172A]' : 'bg-[#0e0f11] border-zinc-900 text-white'
      }`}>
        <div className="space-y-8">
          <div className="flex items-center gap-3 px-2 py-3">
            <BlackBoxLogo className="h-9 w-9" color={isLightTheme ? "#0F172A" : "white"} />
            <div>
              <span className="font-display font-semibold text-sm tracking-tight">Black Box</span>
              <p className="font-display text-[9px] text-[#6B7280] uppercase tracking-widest mt-0.5">Auction Hub</p>
            </div>
          </div>

          <nav className="space-y-1.5">
            {allowedNav.map(item => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition duration-200 ${
                      isActive
                        ? isLightTheme
                          ? 'bg-[#0F172A] text-white shadow-sm'
                          : 'bg-white text-zinc-950 shadow-sm font-semibold'
                        : isLightTheme
                        ? 'text-zinc-650 hover:bg-zinc-100 hover:text-zinc-900'
                        : 'text-zinc-400 hover:bg-zinc-900/40 hover:text-white'
                    }`
                  }
                >
                  <Icon size={18} />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>
        </div>

        <div className={`border-t pt-4 space-y-3 ${isLightTheme ? 'border-zinc-200' : 'border-zinc-900'}`}>
          <div className={`flex items-center gap-3 px-2.5 py-2 rounded-lg border ${
            isLightTheme ? 'bg-zinc-50 border-zinc-200/60' : 'bg-zinc-900/40 border-zinc-800/60'
          }`}>
            <div className={`h-9 w-9 rounded-full flex items-center justify-center font-bold text-sm shadow-sm shrink-0 ${
              isLightTheme ? 'bg-[#0F172A] text-white' : 'bg-white text-zinc-950'
            }`}>
              {user?.email[0].toUpperCase()}
            </div>
            <div className="truncate flex-1">
              <p className={`text-xs font-semibold leading-tight truncate ${isLightTheme ? 'text-zinc-900' : 'text-white'}`}>{user?.email}</p>
              <p className="text-[9px] text-zinc-500 mt-0.5 leading-none uppercase tracking-wider font-bold">
                {user?.role.replace('_', ' ')}
              </p>
            </div>
          </div>
          <button 
            onClick={handleLogout} 
            className={`flex w-full items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition duration-200 cursor-pointer ${
              isLightTheme 
                ? 'text-zinc-500 hover:bg-red-50 hover:text-red-750' 
                : 'text-zinc-400 hover:bg-red-950/20 hover:text-red-400'
            }`}
          >
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </aside>

      {/* Main Panel Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Navbar */}
        <header className={`h-16 border-b px-6 flex items-center justify-between backdrop-blur-md z-10 transition-colors duration-500 ${
          isLightTheme ? 'border-zinc-200 bg-white/80' : 'border-zinc-900 bg-[#0e0f11]/80'
        }`}>
          <div className="flex items-center gap-4 flex-1">
            <div className="relative w-full max-w-xs">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-zinc-400">
                <Search size={15} />
              </span>
              <input 
                type="text" 
                placeholder="Quick search auctions..." 
                className={`w-full pl-9 pr-4 py-1.5 border rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#1B5A9E] focus:border-transparent transition duration-250 ${
                  isLightTheme 
                    ? 'bg-zinc-50 border-zinc-200 text-zinc-800' 
                    : 'bg-zinc-950 border-zinc-800 text-white'
                }`}
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Dark/Light Mode Toggler Button */}
            <button
              onClick={toggleTheme}
              className={`p-2 rounded-lg border transition-all duration-200 cursor-pointer ${
                isLightTheme 
                  ? 'bg-zinc-50 border-zinc-200 text-zinc-650 hover:bg-zinc-100 hover:text-zinc-900' 
                  : 'bg-zinc-950 border-zinc-900 text-zinc-400 hover:bg-zinc-900'
              }`}
              title={isLightTheme ? "Switch to Dark Mode" : "Switch to Light Mode"}
            >
              {isLightTheme ? <Moon size={15} /> : <Sun size={15} />}
            </button>

            <div className="relative">
              <button 
                onClick={() => {
                  setShowNotifications(!showNotifications);
                  setUnreadNotifications(false);
                }}
                className={`relative transition p-2 rounded-lg border cursor-pointer ${
                  isLightTheme 
                    ? 'bg-zinc-50 border-zinc-200 text-zinc-650 hover:bg-zinc-100 hover:text-zinc-900' 
                    : 'bg-zinc-950 border-zinc-900 text-zinc-400 hover:bg-zinc-900 hover:text-white'
                }`}
                title="View Notifications"
              >
                <Bell size={15} />
                {unreadNotifications && (
                  <span className="absolute top-1 right-1 h-2 w-2 bg-[#D97706] rounded-full"></span>
                )}
              </button>

              {/* Premium Notifications Dropdown Panel */}
              {showNotifications && (
                <div className={`absolute right-0 mt-2.5 w-80 rounded-xl border shadow-2xl p-4 z-50 font-body transition-all duration-300 ${
                  isLightTheme ? 'bg-white border-zinc-200 text-zinc-800' : 'bg-[#0f1114] border-zinc-900 text-neutral-200'
                }`}>
                  <div className="flex items-center justify-between border-b pb-2 mb-3">
                    <span className={`text-[11px] font-display font-semibold uppercase tracking-wider ${isLightTheme ? 'text-zinc-500' : 'text-zinc-450'}`}>Notifications</span>
                    <button 
                      onClick={() => {
                        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
                        setUnreadNotifications(false);
                      }}
                      className="text-[10px] text-[#1B5A9E] hover:underline cursor-pointer font-medium"
                    >
                      Mark all as read
                    </button>
                  </div>
                  
                  <div className="space-y-3 max-h-64 overflow-y-auto pr-0.5">
                    {notifications.map(n => (
                      <div 
                        key={n.id} 
                        className={`text-xs p-2.5 rounded-[6px] border transition ${
                          n.read 
                            ? (isLightTheme ? 'bg-zinc-50/50 border-zinc-100/50 text-zinc-500' : 'bg-zinc-950/20 border-zinc-900/30 text-zinc-500') 
                            : (isLightTheme ? 'bg-[#F5F7FA] border-[#E4E7EC] text-zinc-800' : 'bg-zinc-900/30 border-zinc-850 text-neutral-200')
                        }`}
                      >
                        <div className="flex justify-between items-start gap-2 mb-1">
                          <span className="font-semibold leading-tight">{n.title}</span>
                          <span className="text-[9px] text-zinc-400 font-mono-numbers shrink-0">{n.time}</span>
                        </div>
                        <p className={`text-[10px] leading-relaxed ${n.read ? 'text-zinc-400 dark:text-zinc-650' : 'text-zinc-550 dark:text-zinc-400'}`}>{n.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            <div className={`h-6 w-px ${isLightTheme ? 'bg-zinc-200' : 'bg-zinc-900'}`}></div>
            
            <span className={`text-xs font-bold ${isLightTheme ? 'text-zinc-700' : 'text-zinc-350'}`}>
              {user?.company?.name || 'Black Box Ltd'}
            </span>
          </div>
        </header>

        {/* Dynamic Nested Content */}
        <main className={`flex-1 overflow-y-auto transition-colors duration-500 ${
          isLightTheme ? 'bg-[#F5F7FA]' : 'bg-[#070708]'
        }`}>
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;
