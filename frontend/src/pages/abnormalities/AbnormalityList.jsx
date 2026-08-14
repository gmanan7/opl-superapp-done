import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, RefreshCw, AlertTriangle } from 'lucide-react';
import { useAbnormalities, getSessionContext, } from '../../hooks/useAbnormalities';
import { parsePhotoUrls } from '../../lib/imageUpload';
// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_TABS = [
    { value: 'all', labelKey: 'abn.statusAll' },
    { value: 'open', labelKey: 'abn.statusOpen' },
    { value: 'assigned', labelKey: 'abn.statusAssigned' },
    { value: 'wip', labelKey: 'abn.statusWip' },
    { value: 'pending_verify', labelKey: 'abn.statusPending' },
    { value: 'closed', labelKey: 'abn.statusClosed' },
    { value: 'rejected', labelKey: 'abn.statusRejected' },
];
const STATUS_BADGE = {
    open: 'bg-red-100 text-red-700',
    assigned: 'bg-amber-100 text-amber-700',
    wip: 'bg-blue-100 text-blue-700',
    pending_verify: 'bg-purple-100 text-purple-700',
    closed: 'bg-green-100 text-green-700',
    rejected: 'bg-gray-100 text-gray-600',
};
const STATUS_LABEL_KEY = {
    open: 'abn.statusOpen',
    assigned: 'abn.statusAssigned',
    wip: 'abn.statusWip',
    pending_verify: 'abn.statusPending',
    closed: 'abn.statusClosed',
    rejected: 'abn.statusRejected',
};
const TYPE_LABEL_KEY = {
    minor_flaw: 'abn.typeMinorFlaw',
    unfulfilled_basic_condition: 'abn.typeUnfulfilledBasic',
    source_of_contamination: 'abn.typeContamination',
    inaccessible_place: 'abn.typeInaccessible',
    source_of_quality_defect: 'abn.typeQualityDefect',
    unnecessary_item: 'abn.typeUnnecessary',
    unsafe_place: 'abn.typeUnsafe',
};
// ─── Helpers ──────────────────────────────────────────────────────────────────
function daysOpen(createdAt) {
    return Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000);
}
// ─── Card ─────────────────────────────────────────────────────────────────────
function AbnormalityCard({ item, onClick, }) {
    const { t } = useTranslation();
    const photos = parsePhotoUrls(item.photo_url);
    const days = daysOpen(item.created_at);
    return (<button onClick={onClick} className="w-full text-left bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col gap-2 active:scale-[0.99] transition-transform">
      {/* Top row: Red/White badge + status */}
      <div className="flex items-center justify-between gap-2">
        <span className={[
            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide',
            item.red_white_tag === 'red'
                ? 'bg-red-600 text-white'
                : 'bg-gray-100 text-gray-700 border border-gray-300',
        ].join(' ')}>
          <span className={[
            'w-2 h-2 rounded-full',
            item.red_white_tag === 'red' ? 'bg-white' : 'bg-white border border-gray-400',
        ].join(' ')}/>
          {item.red_white_tag === 'red' ? t('abn.tagRed') : t('abn.tagWhite')}
        </span>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[item.status]}`}>
          {t(STATUS_LABEL_KEY[item.status])}
        </span>
      </div>

      {/* Machine + subsection */}
      <p className="text-sm font-semibold text-gray-800 leading-tight">
        {item.machine?.name ?? t('abn.unknownMachine')}
        {item.subsection && (<span className="text-gray-400 font-normal"> › {item.subsection.name}</span>)}
      </p>

      {/* Type */}
      {item.abnormality_type && (<p className="text-xs text-indigo-600 font-medium">
          {t(TYPE_LABEL_KEY[item.abnormality_type] ?? item.abnormality_type)}
        </p>)}

      {/* Description */}
      {item.description && (<p className="text-sm text-gray-600 line-clamp-2 leading-snug">{item.description}</p>)}

      {/* Thumbnail strip */}
      {photos.length > 0 && (<div className="flex gap-2">
          {photos.map((url, i) => (<img key={i} src={url} alt="" className="w-14 h-14 rounded-lg object-cover border border-gray-200"/>))}
        </div>)}

      {/* Footer: days open + reporter */}
      <div className="flex items-center justify-between text-xs text-gray-500 mt-0.5">
        <span>
          {days === 0 ? t('abn.today') : t('abn.daysOpen', { count: days })}
        </span>
        <span>{item.reporter?.name ?? '—'}</span>
      </div>
    </button>);
}
// ─── Main component ───────────────────────────────────────────────────────────
export function AbnormalityList() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const ctx = getSessionContext();
    const [statusFilter, setStatusFilter] = useState('all');
    const [tagFilter, setTagFilter] = useState('all');
    const filters = {
        status: statusFilter,
        red_white_tag: tagFilter,
    };
    const { data, isLoading, error, refetch, isFetching } = useAbnormalities(filters);
    return (<div className="min-h-full bg-stone-50">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white border-b border-stone-200 px-5 pt-4 pb-0">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold text-stone-900">{t('abn.title')}</h1>
          <button onClick={() => refetch()} disabled={isFetching} className="p-2 rounded-lg text-stone-500 hover:bg-stone-100 active:bg-stone-200 transition-colors">
            <RefreshCw size={18} className={isFetching ? 'animate-spin' : ''}/>
          </button>
        </div>

        {/* Red/White toggle */}
        <div className="flex gap-2 mb-3">
          {['all', 'red', 'white'].map((tag) => (<button key={tag} onClick={() => setTagFilter(tag)} className={[
                'flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-colors',
                tagFilter === tag
                    ? tag === 'red'
                        ? 'bg-red-600 border-red-600 text-white'
                        : tag === 'white'
                            ? 'bg-gray-800 border-gray-800 text-white'
                            : 'bg-gray-800 border-gray-800 text-white'
                    : 'bg-white border-gray-200 text-gray-600',
            ].join(' ')}>
              {tag === 'all' ? t('common.all') : tag === 'red' ? t('abn.tagRed') : t('abn.tagWhite')}
            </button>))}
        </div>

        {/* Status tabs — horizontal scroll */}
        <div className="flex gap-1 overflow-x-auto scrollbar-hide pb-0.5 -mx-1 px-1">
          {STATUS_TABS.map(({ value, labelKey }) => {
            const count = value !== 'all' && data
                ? data.filter((a) => a.status === value).length
                : null;
            return (<button key={value} onClick={() => setStatusFilter(value)} className={[
                    'shrink-0 px-3 py-2 text-xs font-medium rounded-t-lg border-b-2 whitespace-nowrap transition-colors',
                    statusFilter === value
                        ? 'border-amber-600 text-amber-600 bg-amber-50'
                        : 'border-transparent text-stone-500 hover:text-stone-700',
                ].join(' ')}>
                {t(labelKey)}
                {count !== null && count > 0 && (<span className="ml-1 bg-amber-100 text-amber-700 rounded-full px-1.5 py-0 text-[10px] font-bold">
                    {count}
                  </span>)}
              </button>);
        })}
        </div>
      </div>

      {/* Content */}
      <div className="px-5 py-4 space-y-3">
        {isLoading && (<div className="flex justify-center py-12 text-gray-400">
            <RefreshCw size={24} className="animate-spin"/>
          </div>)}

        {error && (<div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
            {t('common.error')}: {error.message}
          </div>)}

        {!isLoading && !error && data?.length === 0 && (<div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
            <AlertTriangle size={40} strokeWidth={1.2}/>
            <p className="text-sm font-medium">{t('abn.empty')}</p>
            {ctx && (<button onClick={() => navigate('/abnormalities/new')} className="mt-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700">
                {t('abn.reportNew')}
              </button>)}
          </div>)}

        {data?.map((item) => (<AbnormalityCard key={item.id} item={item} onClick={() => navigate(`/abnormalities/${item.id}`)}/>))}
      </div>

      {/* FAB */}
      <button onClick={() => navigate('/abnormalities/new')} className="fixed bottom-20 right-4 z-30 w-14 h-14 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white rounded-full shadow-lg flex items-center justify-center transition-colors" aria-label={t('abn.reportNew')}>
        <Plus size={26}/>
      </button>
    </div>);
}
