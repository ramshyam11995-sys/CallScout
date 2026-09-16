import React from 'react';
import { CallStatus } from '../types.js';
import { PhoneCall, CheckCircle, XCircle, Clock, AlertCircle, PhoneOff } from 'lucide-react';

interface StatusBadgeProps {
  status: CallStatus;
  size?: 'sm' | 'md' | 'lg';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  let config = {
    label: 'Queued',
    bg: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    icon: Clock,
    animate: false
  };

  switch (status) {
    case 'initiating':
      config = {
        label: 'Dialing...',
        bg: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800',
        icon: PhoneCall,
        animate: true
      };
      break;
    case 'active':
      config = {
        label: 'In Call',
        bg: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800',
        icon: PhoneCall,
        animate: true
      };
      break;
    case 'completed':
      config = {
        label: 'Completed',
        bg: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
        icon: CheckCircle,
        animate: false
      };
      break;
    case 'failed':
      config = {
        label: 'Failed',
        bg: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800',
        icon: AlertCircle,
        animate: false
      };
      break;
    case 'canceled':
      config = {
        label: 'Canceled',
        bg: 'bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700',
        icon: PhoneOff,
        animate: false
      };
      break;
    default:
      config = {
        label: status || 'Queued',
        bg: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
        icon: Clock,
        animate: false
      };
      break;
  }

  const IconComponent = config.icon;

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-1 gap-1.5',
    lg: 'text-sm px-3 py-1.5 gap-2'
  }[size];

  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-3.5 h-3.5',
    lg: 'w-4 h-4'
  }[size];

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium border ${config.bg} ${sizeClasses} transition-all`}
    >
      {config.animate && (
        <span className="relative flex h-2 w-2 mr-0.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
        </span>
      )}
      {!config.animate && <IconComponent className={iconSizes} />}
      <span>{config.label}</span>
    </span>
  );
};
