import { useEffect, useCallback } from 'react';

interface UseKeyboardProps {
    onDelete: () => void;
}

export const useKeyboard = ({ onDelete }: UseKeyboardProps) => {
    const handleKeyDown = useCallback((event: KeyboardEvent) => {
        // Don't handle events if a text input is focused
        const target = event.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
            return;
        }

        if (event.key === 'Delete' || event.key === 'Backspace') {
            event.preventDefault(); // Prevent browser back navigation on backspace
            onDelete();
        }
    }, [onDelete]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);
};
