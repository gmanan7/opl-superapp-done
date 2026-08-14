export function TranslateControl({ originalText, className }) {
    return (<div className={className}>
      <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">{originalText}</p>
    </div>);
}
