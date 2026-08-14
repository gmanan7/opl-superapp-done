export function MachineContextHeader({ name, path, meta, trailing }) {
    const sub = [path.join(' · '), meta].filter(Boolean).join(' · ');
    return (<div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="break-words text-xl font-semibold text-ink-strong">{name}</h3>
        {sub && <p className="mt-0.5 break-words text-sm text-ink-muted">{sub}</p>}
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </div>);
}
