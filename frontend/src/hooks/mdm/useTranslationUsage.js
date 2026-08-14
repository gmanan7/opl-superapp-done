import { useQuery } from '@tanstack/react-query';
export function useTranslationUsage() {
    const ym = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    return useQuery({
        queryKey: ['translation-usage', ym],
        queryFn: async () => {
            return {
                characters_sent: 1200,
                call_count: 15,
                year_month: ym,
            };
        },
    });
}
