import { useMutation } from '@tanstack/react-query';
import { api } from '../lib/api';
export function useTranslateContent() {
    return useMutation({
        mutationFn: async (input) => {
            const res = await api.translate(input.text, input.target);
            return {
                ok: true,
                translated_text: res.translatedText,
                source_lang: input.source === 'auto' ? 'en' : input.source
            };
        },
    });
}
