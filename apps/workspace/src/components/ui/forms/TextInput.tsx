/**
 * TextInput — single-line text input with consistent styling.
 *
 * Uses the shared inputClass from formClasses.ts.
 * Compose inside FormField for label/help/error.
 */

import { forwardRef } from 'react';
import { inputClass } from '../agents/formClasses';

export interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  ({ error, className = '', ...props }, ref) => {
    return (
      <input
        ref={ref}
        type="text"
        className={`${inputClass} ${error ? 'border-red-400' : ''} ${className}`}
        {...props}
      />
    );
  },
);

TextInput.displayName = 'TextInput';

export default TextInput;
