/**
 * FormField — composable label/help/error/layout wrapper for form controls.
 *
 * NOT a monolithic field component — renders label, help text, error, and
 * slots the children control. Compose with TextInput, TextArea, Select, etc.
 */

import type { ReactNode } from 'react';
import { labelClass, errorClass } from '../agents/formClasses';

export interface FormFieldProps {
  label: string;
  htmlFor?: string;
  help?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

export function FormField({ label, htmlFor, help, error, required, children, className = '' }: FormFieldProps) {
  return (
    <div className={className}>
      <label className={labelClass} htmlFor={htmlFor}>
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
      {help && !error && <p className="text-[9px] text-(--vestara-text-dim) mt-0.5">{help}</p>}
      {error && <p className={errorClass}>{error}</p>}
    </div>
  );
}

export default FormField;
