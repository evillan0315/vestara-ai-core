/**
 * Select — authoritative bounded-options select with consistent styling.
 *
 * Uses the shared selectClass from formClasses.ts.
 * Compose inside FormField for label/help/error.
 */

import { forwardRef } from 'react';
import { selectClass } from '../agents/formClasses';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: SelectOption[];
  placeholder?: string;
  error?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ options, placeholder, error, className = '', children, ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={`${selectClass} ${error ? 'border-red-400' : ''} ${className}`}
        {...props}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
        {children}
      </select>
    );
  },
);

Select.displayName = 'Select';

export default Select;
