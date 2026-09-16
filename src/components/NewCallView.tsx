import React, { useState, useEffect, useRef } from 'react';
import {
  PhoneCall,
  Plus,
  Trash2,
  HelpCircle,
  Sparkles,
  FileText,
  CheckCircle,
  AlertCircle,
  ChevronDown,
  Info,
  Layers,
  ArrowRight,
  User,
  Check
} from 'lucide-react';
import { CreateCallPayload, SystemConfigStatus } from '../types.js';
import { useAuth } from '../context/AuthContext.js';

interface NewCallViewProps {
  onSubmit: (payload: CreateCallPayload) => Promise<void>;
  isSubmitting: boolean;
  hasActiveCall?: boolean;
  activeCall?: any;
  onViewActiveCall?: () => void;
  configStatus: SystemConfigStatus | null;
  onOpenConfig: () => void;
}

interface CallTemplate {
  name: string;
  getObjective: (name: string) => string;
  questions: string[];
  getNotes: (name: string) => string;
}

const TEMPLATES: CallTemplate[] = [
  {
    name: 'Restaurant Reservation',
    getObjective: (name: string) => {
      const n = name.trim();
      return `Call the restaurant to reserve a table for a party of 4 this Friday evening around 7:30 PM${n ? ` under the name ${n}` : ''}.`;
    },
    questions: [
      'Do you have a table available for 4 guests this Friday at 7:30 PM?',
      'If not 7:30 PM, what is the closest available time slot between 6:30 PM and 8:30 PM?',
      'Is there outdoor patio seating available upon request?'
    ],
    getNotes: (name: string) => {
      const n = name.trim();
      return `${n ? `Reservation is under the name ${n}. ` : ''}Contact phone number is this phone. If there is a waitlist, inquire how long the typical wait is on Friday nights.`;
    }
  },
  {
    name: 'Clinic / Dental Appointment',
    getObjective: (name: string) => {
      const n = name.trim();
      return `Call the clinic${n ? ` on behalf of patient ${n}` : ''} to check earliest appointment availability for a routine checkup and teeth cleaning, and inquire about cash pricing.`;
    },
    questions: [
      'What is your earliest open appointment slot this week or next week?',
      'What is the estimated out-of-pocket cost for a new patient cleaning and exam?',
      'Do you require dental insurance or offer self-pay discounts?'
    ],
    getNotes: (name: string) => {
      const n = name.trim();
      return `${n ? `Patient name is ${n}. ` : ''}Mention that I am a flexible new patient looking for morning slots if possible.`;
    }
  },
  {
    name: 'Auto Service / Oil Change',
    getObjective: (name: string) => {
      const n = name.trim();
      return `Inquire about synthetic oil change pricing, appointment requirements, and turnaround time${n ? ` for customer ${n}` : ''} (2021 Honda Civic).`;
    },
    questions: [
      'What is your current price for a full synthetic oil change?',
      'Do you accept walk-ins today, or is an appointment required?',
      'Approximately how long does the service take once the car is brought in?'
    ],
    getNotes: (name: string) => {
      const n = name.trim();
      return `Vehicle model is a 2021 Honda Civic.${n ? ` Customer name is ${n}.` : ''}`;
    }
  },
  {
    name: 'Retail Store Inventory & Hours',
    getObjective: (name: string) => {
      const n = name.trim();
      return `Verify current holiday operating hours and confirm stock of high-demand items${n ? ` for customer ${n}` : ''}.`;
    },
    questions: [
      'What are your store hours today and this upcoming weekend?',
      'Do you currently have the item in stock on the sales floor?',
      'Can you hold an item at the customer service desk for same-day pickup?'
    ],
    getNotes: (name: string) => {
      const n = name.trim();
      return `${n ? `Customer name is ${n}. ` : ''}Be concise as retail staff may be busy during peak store hours.`;
    }
  }
];

const COUNTRY_CODES = [
  { code: '+1', country: 'US / Canada' },
  { code: '+44', country: 'United Kingdom' },
  { code: '+61', country: 'Australia' },
  { code: '+49', country: 'Germany' },
  { code: '+33', country: 'France' },
  { code: '+81', country: 'Japan' },
  { code: '+91', country: 'India' },
  { code: '+65', country: 'Singapore' },
  { code: '+52', country: 'Mexico' },
];

export const NewCallView: React.FC<NewCallViewProps> = ({
  onSubmit,
  isSubmitting,
  hasActiveCall = false,
  activeCall = null,
  onViewActiveCall,
  configStatus,
  onOpenConfig
}) => {
  const { user } = useAuth();
  const [countryCode, setCountryCode] = useState('+1');
  const [rawPhone, setRawPhone] = useState('');
  const [callerName, setCallerName] = useState(user?.name || '');
  const [objective, setObjective] = useState('');
  const [questions, setQuestions] = useState<string[]>([
    'What is your earliest open slot or appointment availability?',
    'What is the estimated price or quote for this service?'
  ]);
  const [notes, setNotes] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [clarificationQuestions, setClarificationQuestions] = useState<string[]>([]);
  const [clarificationAnswer, setClarificationAnswer] = useState('');

  // Synchronous submission lock to instantly prevent duplicate clicks or re-renders
  const isSubmittingRef = useRef(false);
  const [isLocalSubmitting, setIsLocalSubmitting] = useState(false);

  // Sync callerName with user name if empty
  useEffect(() => {
    if (user?.name && !callerName) {
      setCallerName(user.name);
    }
  }, [user?.name, callerName]);

  // Extract candidate names from clarification questions (e.g. "mentions both Alex Morgan and vivek singh")
  const extractedCandidates = React.useMemo(() => {
    if (clarificationQuestions.length === 0) return [];
    const candidates: string[] = [];
    for (const q of clarificationQuestions) {
      const match = q.match(/mentions both\s+([A-Za-z\s'-]+?)\s+and\s+([A-Za-z\s'-]+?)(?:\.|\?|$)/i);
      if (match) {
        if (match[1]?.trim()) candidates.push(match[1].trim());
        if (match[2]?.trim()) candidates.push(match[2].trim());
      }
    }
    return Array.from(new Set(candidates));
  }, [clarificationQuestions]);

  const cleanNumber = rawPhone.replace(/[^\d]/g, '');
  const fullE164 = rawPhone.startsWith('+') ? rawPhone.trim() : `${countryCode}${cleanNumber}`;
  const isE164Valid = /^\+[1-9]\d{6,14}$/.test(fullE164);

  const handleCallerNameChange = (newName: string) => {
    const prevName = callerName.trim();
    setCallerName(newName);

    if (newName.trim()) {
      const trimmed = newName.trim();
      // Seamlessly harmonize objective & notes if they contained previous name or legacy 'Alex Morgan'
      setObjective(prev => {
        let updated = prev;
        if (prevName && prevName.toLowerCase() !== trimmed.toLowerCase()) {
          updated = updated.split(prevName).join(trimmed);
        }
        updated = updated.replace(/alex morgan/gi, trimmed);
        return updated;
      });

      setNotes(prev => {
        let updated = prev;
        if (prevName && prevName.toLowerCase() !== trimmed.toLowerCase()) {
          updated = updated.split(prevName).join(trimmed);
        }
        updated = updated.replace(/alex morgan/gi, trimmed);
        return updated;
      });
    }
  };

  const handleAddQuestion = () => {
    setQuestions(prev => [...prev, '']);
  };

  const handleUpdateQuestion = (index: number, val: string) => {
    setQuestions(prev => {
      const next = [...prev];
      next[index] = val;
      return next;
    });
  };

  const handleRemoveQuestion = (index: number) => {
    if (questions.length <= 1) return;
    setQuestions(prev => prev.filter((_, i) => i !== index));
  };

  const applyTemplate = (tpl: CallTemplate) => {
    const currentName = callerName.trim() || user?.name || '';
    setObjective(tpl.getObjective(currentName));
    setQuestions([...tpl.questions]);
    setNotes(tpl.getNotes(currentName));
    setClarificationQuestions([]);
  };

  const handleClarificationResolve = async (customChoice?: string) => {
    const rawAnswer = (typeof customChoice === 'string' ? customChoice : clarificationAnswer).trim();
    if (!rawAnswer || isSubmitting || isLocalSubmitting || isSubmittingRef.current || hasActiveCall) {
      return;
    }

    isSubmittingRef.current = true;
    setIsLocalSubmitting(true);

    // Clean answer to extract candidate name
    const cleanName = rawAnswer
      .replace(/^(?:under the name|under|for|name is|use name|use)\s+/i, '')
      .replace(/['"]/g, '')
      .trim();

    // 1. Update callerName
    setCallerName(cleanName);

    // 2. Harmonize objective: remove conflicting names or legacy 'Alex Morgan'
    let updatedObjective = objective;
    if (cleanName.toLowerCase() !== 'alex morgan') {
      updatedObjective = updatedObjective.replace(/alex morgan/gi, cleanName);
    }
    // Update or append reservation name
    if (/under the name\s+[A-Za-z\s'-]+/i.test(updatedObjective)) {
      updatedObjective = updatedObjective.replace(/under the name\s+[A-Za-z\s'-]+/i, `under the name ${cleanName}`);
    } else if (!updatedObjective.toLowerCase().includes(cleanName.toLowerCase())) {
      updatedObjective = `${updatedObjective} (under the name ${cleanName})`;
    }
    setObjective(updatedObjective);

    // 3. Harmonize notes
    let updatedNotes = notes;
    if (cleanName.toLowerCase() !== 'alex morgan') {
      updatedNotes = updatedNotes.replace(/alex morgan/gi, cleanName);
    }
    setNotes(updatedNotes);

    setClarificationQuestions([]);
    setClarificationAnswer('');

    const validQuestions = questions.map(q => q.trim()).filter(q => q.length > 0);
    try {
      await onSubmit({
        phoneNumber: fullE164,
        objective: updatedObjective,
        questions: validQuestions,
        notes: updatedNotes.trim(),
        callerName: cleanName
      });
    } catch (err: any) {
      if (err.isClarificationNeeded || (err.clarificationQuestions && err.clarificationQuestions.length > 0)) {
        setClarificationQuestions(err.clarificationQuestions.length > 0 ? err.clarificationQuestions : [err.message]);
      }
    } finally {
      isSubmittingRef.current = false;
      setIsLocalSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isSubmittingRef.current || isSubmitting || isLocalSubmitting || hasActiveCall) {
      return;
    }

    if (!isE164Valid) {
      return;
    }

    const validQuestions = questions.map(q => q.trim()).filter(q => q.length > 0);
    if (validQuestions.length === 0) {
      return;
    }

    // Immediately disable submission state synchronously to prevent duplicate actions
    isSubmittingRef.current = true;
    setIsLocalSubmitting(true);

    const nameToUse = callerName.trim() || user?.name || '';

    let finalObjective = objective.trim();
    let finalNotes = notes.trim();

    // If caller specified a custom name, harmonize any legacy 'Alex Morgan'
    if (nameToUse && nameToUse.toLowerCase() !== 'alex morgan') {
      finalObjective = finalObjective.replace(/alex morgan/gi, nameToUse);
      finalNotes = finalNotes.replace(/alex morgan/gi, nameToUse);
    }

    // Smart pre-flight check: if booking/reservation and no name in objective, ensure it is clear
    const lowerObj = finalObjective.toLowerCase();
    const isBooking = lowerObj.includes('reserv') || lowerObj.includes('book') || lowerObj.includes('table') || lowerObj.includes('appointment');
    const hasName = lowerObj.includes('name') || lowerObj.includes('under') || lowerObj.includes('for ');
    if (isBooking && !hasName && nameToUse) {
      finalObjective = `${finalObjective} under the name ${nameToUse}`;
      setObjective(finalObjective);
    }

    try {
      setClarificationQuestions([]);
      await onSubmit({
        phoneNumber: fullE164,
        objective: finalObjective,
        questions: validQuestions,
        notes: finalNotes,
        callerName: nameToUse
      });
    } catch (err: any) {
      if (err.isClarificationNeeded || (err.clarificationQuestions && err.clarificationQuestions.length > 0)) {
        setClarificationQuestions(err.clarificationQuestions.length > 0 ? err.clarificationQuestions : [err.message]);
      }
    } finally {
      isSubmittingRef.current = false;
      setIsLocalSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-4 px-4 sm:px-6">
      {/* Active Call In Progress Guard Banner (Requirement 7) */}
      {hasActiveCall && (
        <div className="mb-6 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/80 p-4 sm:p-5 rounded-2xl flex items-start gap-3.5 shadow-sm">
          <Info className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-xs sm:text-sm text-amber-950 dark:text-amber-200">
            <h4 className="font-bold text-sm text-amber-900 dark:text-amber-200">
              Active Telephone Call in Progress
            </h4>
            <p className="mt-1 opacity-90 leading-relaxed">
              CALL-E restricts concurrent requests to one active call at a time. Call #{activeCall?.id?.slice(0, 10) || 'current'} to {activeCall?.phoneNumber || 'target'} is currently {activeCall?.status || 'active'}. Please wait for it to conclude before dispatching another call.
            </p>
            {onViewActiveCall && (
              <button
                type="button"
                onClick={onViewActiveCall}
                className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-bold text-amber-900 dark:text-amber-100 underline hover:no-underline"
              >
                View Active Call Live Status & Transcript →
              </button>
            )}
          </div>
        </div>
      )}

      {/* Missing Config Alert if CALL-E API key not set */}
      {configStatus && !configStatus.calleConfigured && (
        <div className="mb-6 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 p-4 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-xs sm:text-sm text-amber-900 dark:text-amber-200">
            <p className="font-semibold mb-1">CALL_E_API_KEY Required for Real Telephony</p>
            <p className="opacity-90">
              CALL-E makes real PSTN telephone calls. To dispatch calls to actual phones, configure your CALL_E_API_KEY from the CALL-E portal.
            </p>
            <button
              onClick={onOpenConfig}
              className="mt-2 text-xs font-bold text-amber-900 dark:text-amber-100 underline hover:no-underline"
            >
              Configure Environment & Keys →
            </button>
          </div>
        </div>
      )}

      {/* Clarification Request Alert Banner */}
      {clarificationQuestions.length > 0 && (
        <div className="mb-6 bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-700/80 p-4 sm:p-5 rounded-2xl shadow-sm">
          <div className="flex items-start gap-3">
            <HelpCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 text-xs sm:text-sm text-amber-950 dark:text-amber-100">
              <h4 className="font-bold text-sm text-amber-900 dark:text-amber-200">
                CALL-E Voice Engine: Additional Detail Required
              </h4>
              <p className="mt-1 text-xs text-amber-800/90 dark:text-amber-300">
                The telephony agent needs clarification before dispatching the call:
              </p>

              <div className="mt-2.5 space-y-1.5">
                {clarificationQuestions.map((q, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-xl bg-amber-100/80 dark:bg-amber-900/50 border border-amber-200 dark:border-amber-800 text-xs font-semibold text-amber-900 dark:text-amber-100"
                  >
                    {q}
                  </div>
                ))}
              </div>

              {/* Quick candidate selection pills if CALL-E mentions multiple conflicting names */}
              {extractedCandidates.length > 0 && (
                <div className="mt-3 pt-2.5 border-t border-amber-200/70 dark:border-amber-800/60">
                  <p className="text-xs font-bold text-amber-900 dark:text-amber-200 mb-1.5">
                    Select the intended reservation / contact name:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {extractedCandidates.map(candidate => (
                      <button
                        key={candidate}
                        type="button"
                        onClick={() => handleClarificationResolve(candidate)}
                        disabled={isSubmitting || isLocalSubmitting}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-200/90 dark:bg-amber-800 hover:bg-amber-300 dark:hover:bg-amber-700 text-amber-900 dark:text-amber-100 text-xs font-bold shadow-sm transition-all disabled:opacity-50"
                      >
                        <Check className="w-3.5 h-3.5 text-amber-700 dark:text-amber-200" />
                        Use "{candidate}"
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-3 flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={clarificationAnswer}
                  onChange={e => setClarificationAnswer(e.target.value)}
                  placeholder={`e.g. ${callerName || 'Vivek Singh'}`}
                  className="flex-1 bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleClarificationResolve()}
                  disabled={!clarificationAnswer.trim() || isSubmitting}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-sm disabled:opacity-50 transition-all flex items-center justify-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  Apply & Dispatch Call
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Page Title & Intro */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
          <PhoneCall className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
          Dispatch Real Phone Call
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Provide the recipient number, target objective, and required questions. The CALL-E AI agent will dial, hold an adaptive conversation, and return structured results.
        </p>
      </div>

      {/* Templates Selector */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
            Quick Start Templates
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {TEMPLATES.map((t, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => applyTemplate(t)}
              className="text-left p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-indigo-400 dark:hover:border-indigo-600 hover:shadow-sm transition-all group"
            >
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                {t.name}
              </p>
              <p className="text-[11px] text-slate-400 mt-1 line-clamp-2 leading-snug">
                {t.getObjective(callerName.trim() || user?.name || '')}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Main Call Form */}
      <form onSubmit={handleSubmit} className="space-y-6 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
        
        {/* Phone Number Input */}
        <div>
          <label htmlFor="phone-number-input" className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
            Target Phone Number (E.164) <span className="text-rose-500">*</span>
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative sm:w-44 flex-shrink-0">
              <select
                id="country-code-select"
                value={countryCode}
                onChange={e => setCountryCode(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                {COUNTRY_CODES.map(c => (
                  <option key={c.code} value={c.code}>
                    {c.code} ({c.country})
                  </option>
                ))}
              </select>
            </div>

            <div className="relative flex-1">
              <input
                id="phone-number-input"
                type="tel"
                value={rawPhone}
                onChange={e => setRawPhone(e.target.value)}
                placeholder="4155552671 or +14155552671"
                required
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-mono text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
              <div className="absolute right-3 top-2.5 text-xs flex items-center gap-1">
                {isE164Valid ? (
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" /> Valid E.164 ({fullE164})
                  </span>
                ) : rawPhone ? (
                  <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" /> Enter full digits
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1">
            <Info className="w-3 h-3" />
            E.164 international standard format including country code (+1 for US, etc.).
          </p>
        </div>

        {/* Reservation / Contact Name Input */}
        <div>
          <label htmlFor="caller-name-input" className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
            Reservation / Contact Name <span className="text-rose-500">*</span>
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <User className="w-4 h-4" />
            </div>
            <input
              id="caller-name-input"
              type="text"
              value={callerName}
              onChange={e => handleCallerNameChange(e.target.value)}
              placeholder="e.g. Vivek Singh"
              required
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:outline-none font-medium"
            />
          </div>
          <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1">
            <Info className="w-3 h-3" />
            Used by CALL-E when reserving tables, booking clinic appointments, or answering whom the call is for.
          </p>
        </div>

        {/* Objective */}
        <div>
          <label htmlFor="objective-input" className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
            Call Objective & Goal <span className="text-rose-500">*</span>
          </label>
          <textarea
            id="objective-input"
            rows={3}
            value={objective}
            onChange={e => setObjective(e.target.value)}
            placeholder="e.g. Call Apex Dental Care to verify if they are accepting new patients, check earliest open teeth cleaning appointments for next week, and get self-pay pricing."
            required
            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:outline-none leading-relaxed"
          />
        </div>

        {/* Questions Builder */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Specific Questions to Ask <span className="text-rose-500">*</span>
            </label>
            <button
              type="button"
              onClick={handleAddQuestion}
              className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Add Question
            </button>
          </div>

          <div className="space-y-2.5">
            {questions.map((q, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="text-xs font-bold font-mono text-slate-400 w-6 text-right">
                  #{idx + 1}
                </span>
                <input
                  type="text"
                  id={`question-input-${idx}`}
                  value={q}
                  onChange={e => handleUpdateQuestion(idx, e.target.value)}
                  placeholder={`Question #${idx + 1} for CALL-E to ask`}
                  required
                  className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
                <button
                  type="button"
                  id={`remove-question-${idx}`}
                  onClick={() => handleRemoveQuestion(idx)}
                  disabled={questions.length <= 1}
                  className="p-2 text-slate-400 hover:text-rose-500 disabled:opacity-30 transition-colors"
                  title="Remove question"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Optional Notes */}
        <div>
          <label htmlFor="notes-input" className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
            Caller Persona & Special Instructions (Optional)
          </label>
          <textarea
            id="notes-input"
            rows={2}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="e.g. You are calling on behalf of Mark. If placed on hold, wait up to 60 seconds. Mention preference for morning appointments."
            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:outline-none leading-relaxed"
          />
        </div>

        {/* Schema / Prompt Preview Toggle */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            className="text-xs font-semibold text-slate-500 hover:text-indigo-600 flex items-center gap-1.5"
          >
            <Layers className="w-3.5 h-3.5" />
            {showPreview ? 'Hide CALL-E Task Payload Preview' : 'Show CALL-E Task Payload Preview'}
          </button>

          {showPreview && (
            <div className="mt-3 p-4 bg-slate-950 text-slate-300 rounded-xl text-xs font-mono space-y-2 overflow-x-auto">
              <p className="text-slate-500 font-bold">// Target: {fullE164}</p>
              <p className="text-slate-500 font-bold">// CALL-E Task Prompt:</p>
              <p className="text-emerald-400 whitespace-pre-line">{objective}</p>
              <p className="text-slate-500 font-bold mt-2">// Required Questions:</p>
              {questions.map((q, i) => (
                <p key={i} className="text-sky-300">{i + 1}. {q}</p>
              ))}
            </div>
          )}
        </div>

        {/* Submit Button */}
        <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Calls are dispatched directly to the CALL-E real telephone network.
          </div>

          <button
            type="submit"
            id="start-call-submit-button"
            disabled={isLocalSubmitting || isSubmitting || hasActiveCall || !isE164Valid || !objective.trim()}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-lg shadow-indigo-600/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <PhoneCall className={`w-4 h-4 ${(isSubmitting || isLocalSubmitting) ? 'animate-bounce' : ''}`} />
            <span>
              {hasActiveCall
                ? 'Call In Progress (Waiting...)'
                : (isSubmitting || isLocalSubmitting)
                  ? 'Initiating Phone Call...'
                  : 'Start Real Phone Call'}
            </span>
            <ArrowRight className="w-4 h-4 ml-1" />
          </button>
        </div>
      </form>
    </div>
  );
};
