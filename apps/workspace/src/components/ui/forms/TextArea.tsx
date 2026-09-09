/**
 * TextArea — multiline text input with consistent styling.
 *
 * Uses the shared inputClass from formClasses.ts adapted for textarea.
 * Compose inside FormField for label/help/error.
 */

import { forwardRef } from 'react';

export interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ error, className = '', ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={`w-full bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg px-2.5 py-1.5 text-xs text-(--vestara-text-2) placeholder:text-(--vestara-text-dim) outline-none focus:border-(--vestara-accent-border-active) transition-colors resize-none ${error ? 'border-red-400' : ''} ${className}`}
        {...props}
      />
    );
  },
);

TextArea.displayName = 'TextArea';

export default TextArea;
