import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Wrench, CheckCircle2, Droplets, Lock, AlertCircle, Trash2, ShieldAlert, X, ImagePlus, Loader2, } from 'lucide-react';
import { useCreateAbnormality, useMachinesByGroup, useMachineSubsections, getSessionContext, } from '../../hooks/useAbnormalities';
import { uploadAbnormalityImages, serializePhotoUrls } from '../../lib/imageUpload';
const ABN_TYPES = [
    { value: 'minor_flaw', labelKey: 'abn.typeMinorFlaw', Icon: Wrench, color: 'text-yellow-600' },
    { value: 'unfulfilled_basic_condition', labelKey: 'abn.typeUnfulfilledBasic', Icon: CheckCircle2, color: 'text-orange-500' },
    { value: 'source_of_contamination', labelKey: 'abn.typeContamination', Icon: Droplets, color: 'text-teal-600' },
    { value: 'inaccessible_place', labelKey: 'abn.typeInaccessible', Icon: Lock, color: 'text-purple-600' },
    { value: 'source_of_quality_defect', labelKey: 'abn.typeQualityDefect', Icon: AlertCircle, color: 'text-red-600' },
    { value: 'unnecessary_item', labelKey: 'abn.typeUnnecessary', Icon: Trash2, color: 'text-gray-500' },
    { value: 'unsafe_place', labelKey: 'abn.typeUnsafe', Icon: ShieldAlert, color: 'text-red-500' },
];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];
const PRIORITY_COLORS = {
    low: 'bg-gray-100 text-gray-700 border-gray-200',
    medium: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    high: 'bg-orange-50 text-orange-700 border-orange-200',
    critical: 'bg-red-50 text-red-700 border-red-200',
};
const PRIORITY_ACTIVE = {
    low: 'bg-gray-700 text-white border-gray-700',
    medium: 'bg-yellow-500 text-white border-yellow-500',
    high: 'bg-orange-500 text-white border-orange-500',
    critical: 'bg-red-600 text-white border-red-600',
};
// ─── Component ────────────────────────────────────────────────────────────────
export function AbnormalityForm() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const ctx = getSessionContext();
    const createMutation = useCreateAbnormality();
    // Form state
    const [machineId, setMachineId] = useState('');
    const [subsectionId, setSubsectionId] = useState('');
    const [abnType, setAbnType] = useState('');
    const [redWhiteTag, setRedWhiteTag] = useState('white');
    const [description, setDescription] = useState('');
    const [priority, setPriority] = useState('medium');
    const [images, setImages] = useState([]);
    const [previews, setPreviews] = useState([]);
    const [submitError, setSubmitError] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const fileInputRef = useRef(null);
    const jhGroupId = ctx?.jh_group_id ?? undefined;
    const { data: machines = [] } = useMachinesByGroup(jhGroupId);
    const { data: subsections = [] } = useMachineSubsections(machineId || null);
    // Reset subsection when machine changes
    const handleMachineChange = (id) => {
        setMachineId(id);
        setSubsectionId('');
    };
    // Image selection
    const handleImageChange = useCallback((e) => {
        const files = Array.from(e.target.files ?? []);
        const remaining = 2 - images.length;
        const toAdd = files.slice(0, remaining);
        if (!toAdd.length)
            return;
        setImages((prev) => [...prev, ...toAdd]);
        toAdd.forEach((f) => {
            const url = URL.createObjectURL(f);
            setPreviews((prev) => [...prev, url]);
        });
        e.target.value = '';
    }, [images.length]);
    const removeImage = (index) => {
        URL.revokeObjectURL(previews[index]);
        setImages((prev) => prev.filter((_, i) => i !== index));
        setPreviews((prev) => prev.filter((_, i) => i !== index));
    };
    const handleSubmit = async () => {
        if (!ctx?.factory_id) {
            setSubmitError(t('abn.errorNoFactory'));
            return;
        }
        if (!abnType) {
            setSubmitError(t('abn.errorSelectType'));
            return;
        }
        if (!description.trim() || description.trim().length < 5) {
            setSubmitError(t('abn.errorDescTooShort'));
            return;
        }
        setIsSubmitting(true);
        setSubmitError(null);
        try {
            const id = crypto.randomUUID();
            let photoUrl = null;
            if (images.length > 0) {
                const urls = await uploadAbnormalityImages(images, ctx.factory_id, ctx.jh_group_id ?? 'unknown', id);
                photoUrl = serializePhotoUrls(urls);
            }
            await createMutation.mutateAsync({
                id,
                machine_id: machineId || null,
                subsection_id: subsectionId || null,
                title: description.trim().slice(0, 120),
                description: description.trim(),
                abnormality_type: abnType,
                red_white_tag: redWhiteTag,
                priority,
                photo_url: photoUrl,
            });
            navigate('/abnormalities', { replace: true });
        }
        catch (err) {
            setSubmitError(err.message);
        }
        finally {
            setIsSubmitting(false);
        }
    };
    return (<div className="min-h-full bg-stone-50">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white border-b border-stone-200 flex items-center gap-3 px-5 py-3">
        <button onClick={() => navigate(-1)} className="p-1.5 -ml-1.5 rounded-lg text-stone-500 hover:bg-stone-100">
          <ChevronLeft size={22}/>
        </button>
        <h1 className="text-base font-semibold text-gray-900">{t('abn.formTitle')}</h1>
      </div>

      <div className="px-5 py-5 space-y-6 pb-32">
        {/* Machine */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            {t('abn.machine')}
          </label>
          <select value={machineId} onChange={(e) => handleMachineChange(e.target.value)} className="w-full h-11 px-3 rounded-xl border border-gray-300 bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-500">
            <option value="">{t('abn.selectMachine')}</option>
            {machines.map((m) => (<option key={m.id} value={m.id}>{m.name}</option>))}
          </select>
        </div>

        {/* Subsection */}
        {machineId && (<div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              {t('abn.subsection')}
              <span className="ml-1 text-xs text-gray-400">({t('common.optional')})</span>
            </label>
            <select value={subsectionId} onChange={(e) => setSubsectionId(e.target.value)} className="w-full h-11 px-3 rounded-xl border border-gray-300 bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-500">
              <option value="">{t('abn.selectSubsection')}</option>
              {subsections.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
            </select>
          </div>)}

        {/* Abnormality type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t('abn.type')} <span className="text-red-500">*</span>
          </label>
          <div className="flex flex-col gap-2">
            {ABN_TYPES.map(({ value, labelKey, Icon, color }) => {
            const selected = abnType === value;
            return (<button key={value} type="button" onClick={() => setAbnType(value)} className={[
                    'flex items-center gap-3 w-full min-h-[52px] px-4 py-3 rounded-xl border-2 text-left transition-all',
                    selected
                        ? 'border-amber-600 bg-amber-50'
                        : 'border-gray-200 bg-white hover:border-gray-300',
                ].join(' ')}>
                  <Icon size={22} className={selected ? 'text-amber-600' : color} strokeWidth={selected ? 2.2 : 1.8}/>
                  <span className={[
                    'text-sm font-medium',
                    selected ? 'text-amber-700' : 'text-stone-800',
                ].join(' ')}>
                    {t(labelKey)}
                  </span>
                  {selected && (<div className="ml-auto w-5 h-5 rounded-full bg-amber-600 flex items-center justify-center shrink-0">
                      <div className="w-2 h-2 rounded-full bg-white"/>
                    </div>)}
                </button>);
        })}
          </div>
        </div>

        {/* Red / White tag */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t('abn.tagLabel')} <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            {/* RED */}
            <button type="button" onClick={() => setRedWhiteTag('red')} className={[
            'flex flex-col items-center justify-center gap-1.5 min-h-[90px] px-3 py-4 rounded-2xl border-2 transition-all',
            redWhiteTag === 'red'
                ? 'bg-red-600 border-red-600 text-white shadow-lg shadow-red-200'
                : 'bg-white border-gray-200 text-gray-700 hover:border-red-300',
        ].join(' ')}>
              <span className={`text-2xl font-black ${redWhiteTag === 'red' ? 'text-white' : 'text-red-600'}`}>R</span>
              <span className="text-sm font-bold">{t('abn.tagRed')}</span>
              <span className={`text-[11px] text-center leading-tight ${redWhiteTag === 'red' ? 'text-red-100' : 'text-gray-400'}`}>
                {t('abn.tagRedDesc')}
              </span>
            </button>

            {/* WHITE */}
            <button type="button" onClick={() => setRedWhiteTag('white')} className={[
            'flex flex-col items-center justify-center gap-1.5 min-h-[90px] px-3 py-4 rounded-2xl border-2 transition-all',
            redWhiteTag === 'white'
                ? 'bg-gray-800 border-gray-800 text-white shadow-lg shadow-gray-300'
                : 'bg-white border-gray-200 text-gray-700 hover:border-gray-400',
        ].join(' ')}>
              <span className={`text-2xl font-black ${redWhiteTag === 'white' ? 'text-white' : 'text-gray-700'}`}>W</span>
              <span className="text-sm font-bold">{t('abn.tagWhite')}</span>
              <span className={`text-[11px] text-center leading-tight ${redWhiteTag === 'white' ? 'text-gray-300' : 'text-gray-400'}`}>
                {t('abn.tagWhiteDesc')}
              </span>
            </button>
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            {t('abn.description')} <span className="text-red-500">*</span>
          </label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('abn.descriptionPlaceholder')} rows={4} className="w-full px-3 py-2.5 rounded-xl border border-gray-300 bg-white text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"/>
        </div>

        {/* Priority */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t('abn.priority')}
          </label>
          <div className="grid grid-cols-4 gap-2">
            {PRIORITIES.map((p) => (<button key={p} type="button" onClick={() => setPriority(p)} className={[
                'py-2.5 rounded-xl border text-xs font-semibold capitalize transition-all',
                priority === p ? PRIORITY_ACTIVE[p] : PRIORITY_COLORS[p],
            ].join(' ')}>
                {t(`abn.priority_${p}`)}
              </button>))}
          </div>
        </div>

        {/* Image upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t('abn.photos')}
            <span className="ml-1 text-xs text-gray-400">({t('abn.photosMax')})</span>
          </label>
          <div className="flex gap-3">
            {previews.map((url, i) => (<div key={i} className="relative w-24 h-24 shrink-0">
                <img src={url} alt="" className="w-24 h-24 rounded-xl object-cover border border-gray-200"/>
                <button type="button" onClick={() => removeImage(i)} className="absolute -top-2 -right-2 w-6 h-6 bg-red-600 text-white rounded-full flex items-center justify-center shadow">
                  <X size={12}/>
                </button>
              </div>))}
            {images.length < 2 && (<button type="button" onClick={() => fileInputRef.current?.click()} className="w-24 h-24 rounded-xl border-2 border-dashed border-gray-300 bg-white flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors shrink-0">
                <ImagePlus size={22}/>
                <span className="text-[11px] font-medium">{t('abn.addPhoto')}</span>
              </button>)}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleImageChange} className="hidden"/>
        </div>

        {/* Error */}
        {submitError && (<div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
            {submitError}
          </div>)}
      </div>

      {/* Submit footer */}
      <div className="fixed bottom-16 left-0 right-0 z-20 bg-white border-t border-gray-200 px-4 py-3">
        <button type="button" onClick={handleSubmit} disabled={isSubmitting || !abnType || !description.trim()} className="w-full h-12 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 disabled:bg-stone-200 disabled:text-stone-400 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors">
          {isSubmitting ? (<>
              <Loader2 size={18} className="animate-spin"/>
              {t('common.submitting')}
            </>) : (t('abn.submitReport'))}
        </button>
      </div>
    </div>);
}
