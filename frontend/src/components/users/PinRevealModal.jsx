import { useEffect, useRef, useState } from 'react';
import { Copy, Check, AlertTriangle } from 'lucide-react';
const COUNTDOWN_SECONDS = 3;
export function PinRevealModal({ isOpen, pin, userName, mode, onConfirm }) {
    const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
    const [copied, setCopied] = useState(false);
    const intervalRef = useRef(null);
    // Reset countdown each time modal opens
    useEffect(() => {
        if (!isOpen)
            return;
        setCountdown(COUNTDOWN_SECONDS);
        setCopied(false);
        intervalRef.current = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) {
                    clearInterval(intervalRef.current);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => {
            if (intervalRef.current)
                clearInterval(intervalRef.current);
        };
    }, [isOpen]);
    // Block Escape key — modal can only be dismissed via confirm button
    useEffect(() => {
        if (!isOpen)
            return;
        const handler = (e) => {
            if (e.key === 'Escape')
                e.preventDefault();
        };
        window.addEventListener('keydown', handler, true);
        return () => window.removeEventListener('keydown', handler, true);
    }, [isOpen]);
    async function handleCopy() {
        try {
            await navigator.clipboard.writeText(pin);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
        catch {
            // clipboard unavailable — silently ignore
        }
    }
    if (!isOpen)
        return null;
    const heading = mode === 'created' ? `PIN created for ${userName}` : `New PIN for ${userName}`;
    return (<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4" 
    // Swallow all click events on the overlay — card is the only interactive surface
    onPointerDown={e => e.stopPropagation()}>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden" onPointerDown={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 pt-6 pb-4 text-center">
          <h2 className="text-lg font-semibold text-gray-900 leading-snug">{heading}</h2>
        </div>

        {/* PIN display */}
        <div className="px-6 pb-4 flex flex-col items-center gap-3">
          <div className="flex gap-3">
            {pin.split('').map((digit, i) => (<span key={i} className="w-10 h-12 flex items-center justify-center rounded-lg bg-gray-100 font-mono text-3xl font-bold text-gray-900 tracking-widest select-all">
                {digit}
              </span>))}
          </div>

          <button type="button" onClick={handleCopy} className={[
            'flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors',
            copied
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
        ].join(' ')}>
            {copied ? (<>
                <Check size={14}/>
                Copied!
              </>) : (<>
                <Copy size={14}/>
                Copy PIN
              </>)}
          </button>
        </div>

        {/* Warning */}
        <div className="mx-6 mb-5 flex gap-2.5 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
          <AlertTriangle size={16} className="text-red-600 mt-0.5 shrink-0"/>
          <p className="text-sm text-red-700 leading-snug">
            This PIN will not be shown again. Hand it to the team member in person.
          </p>
        </div>

        {/* Confirm button */}
        <div className="px-6 pb-6">
          <button type="button" onClick={() => {
            if (countdown > 0)
                return;
            onConfirm();
        }} disabled={countdown > 0} className={[
            'w-full py-3 rounded-xl font-semibold text-sm transition-colors',
            countdown > 0
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-gray-900 text-white hover:bg-gray-800 active:bg-black',
        ].join(' ')}>
            {countdown > 0 ? `Please wait ${countdown}…` : 'I have recorded the PIN'}
          </button>
        </div>
      </div>
    </div>);
}
