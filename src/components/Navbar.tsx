import React from 'react';
import { useAuth } from '../context/AuthContext.js';
import { useTheme } from '../context/ThemeContext.js';
import {
  PhoneCall,
  Radio,
  Sliders,
  LogOut,
  User,
  ShieldCheck,
  Zap,
  Menu,
  X,
  Sun,
  Moon
} from 'lucide-react';
import { SystemConfigStatus } from '../types.js';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  configStatus: SystemConfigStatus | null;
  onOpenConfig: () => void;
  onOpenAuth: () => void;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  configStatus,
  onOpenConfig,
  onOpenAuth,
  mobileMenuOpen,
  setMobileMenuOpen
}) => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200/80 bg-white/95 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/95">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <button
              id="brand-logo-button"
              onClick={() => setActiveTab('dashboard')}
              className="flex items-center gap-2.5 group text-left focus:outline-none"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-sky-400 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 group-hover:scale-105 transition-transform duration-200">
                <PhoneCall className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                    CallScout<span className="text-indigo-600 dark:text-indigo-400"> AI</span>
                  </span>
                  <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                    CALL-E Engine
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-none hidden md:block">
                  Autonomous Goal-Driven Voice Agent
                </p>
              </div>
            </button>
          </div>

          {/* Desktop Nav Links */}
          <nav className="hidden md:flex items-center gap-1">
            <button
              id="nav-tab-dashboard"
              onClick={() => setActiveTab('dashboard')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'dashboard'
                  ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
              }`}
            >
              Dashboard
            </button>
            <button
              id="nav-tab-new-call"
              onClick={() => setActiveTab('new-call')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'new-call'
                  ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
              }`}
            >
              New Call
            </button>
            <button
              id="nav-tab-history"
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'history'
                  ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
              }`}
            >
              Call History
            </button>
          </nav>

          {/* Right Action Tools & Auth */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* System Status Pill */}
            <button
              id="system-config-status-button"
              onClick={onOpenConfig}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors text-slate-700 dark:text-slate-300"
              title="View CALL-E and Database configuration status"
            >
              <Radio className={`w-3.5 h-3.5 ${configStatus?.calleConfigured ? 'text-emerald-500 animate-pulse' : 'text-amber-500'}`} />
              <span className="hidden lg:inline">
                {configStatus?.calleConfigured ? 'CALL-E Connected' : 'Setup CALL-E'}
              </span>
              <Sliders className="w-3.5 h-3.5 text-slate-400 ml-1" />
            </button>

            {/* Global Dark / Light Mode Toggle */}
            <button
              id="theme-toggle-button"
              type="button"
              onClick={toggleTheme}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400 hover:rotate-45 transition-transform" />
              ) : (
                <Moon className="w-4 h-4 text-slate-600 hover:-rotate-12 transition-transform" />
              )}
            </button>

            {/* User Profile or Login */}
            {user ? (
              <div className="flex items-center gap-2 pl-1 sm:pl-2 border-l border-slate-200 dark:border-slate-800">
                <div className="hidden sm:flex flex-col items-end">
                  <span className="text-xs font-semibold text-slate-900 dark:text-white leading-tight">
                    {user.name || user.email.split('@')[0]}
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight truncate max-w-[140px]">
                    {user.email}
                  </span>
                </div>
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold ring-2 ring-indigo-500/20">
                  {(user.name || user.email)[0].toUpperCase()}
                </div>
                <button
                  id="navbar-logout-button"
                  onClick={() => logout()}
                  className="p-1.5 text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
                  title="Sign Out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                id="navbar-login-button"
                onClick={onOpenAuth}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors"
              >
                <User className="w-3.5 h-3.5" />
                <span>Sign In</span>
              </button>
            )}

            {/* Mobile Menu Toggle */}
            <button
              id="mobile-menu-toggle"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile dropdown menu */}
        {mobileMenuOpen && (
          <div className="md:hidden py-3 border-t border-slate-200 dark:border-slate-800 flex flex-col gap-1">
            <button
              id="mobile-tab-dashboard"
              onClick={() => {
                setActiveTab('dashboard');
                setMobileMenuOpen(false);
              }}
              className={`px-3 py-2 text-left text-sm font-medium rounded-lg ${
                activeTab === 'dashboard' ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-600' : 'text-slate-700 dark:text-slate-300'
              }`}
            >
              Dashboard
            </button>
            <button
              id="mobile-tab-new-call"
              onClick={() => {
                setActiveTab('new-call');
                setMobileMenuOpen(false);
              }}
              className={`px-3 py-2 text-left text-sm font-medium rounded-lg ${
                activeTab === 'new-call' ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-600' : 'text-slate-700 dark:text-slate-300'
              }`}
            >
              New Call
            </button>
            <button
              id="mobile-tab-history"
              onClick={() => {
                setActiveTab('history');
                setMobileMenuOpen(false);
              }}
              className={`px-3 py-2 text-left text-sm font-medium rounded-lg ${
                activeTab === 'history' ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-600' : 'text-slate-700 dark:text-slate-300'
              }`}
            >
              Call History
            </button>

            {/* Mobile Theme Toggle */}
            <div className="pt-2 mt-1 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between px-3">
              <span className="text-xs text-slate-500 dark:text-slate-400">Appearance</span>
              <button
                id="mobile-theme-toggle-button"
                type="button"
                onClick={toggleTheme}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
              >
                {theme === 'dark' ? (
                  <>
                    <Sun className="w-3.5 h-3.5 text-amber-400" />
                    <span>Light Mode</span>
                  </>
                ) : (
                  <>
                    <Moon className="w-3.5 h-3.5 text-slate-600" />
                    <span>Dark Mode</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};
