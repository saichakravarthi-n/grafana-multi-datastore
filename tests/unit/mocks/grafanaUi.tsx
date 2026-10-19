import React, { ChangeEvent, ReactNode } from 'react';
import { GrafanaTheme2 } from '@grafana/data';

export const theme = {
  colors: {
    border: { medium: '#ccc', weak: '#eee' },
    background: { primary: '#fff', secondary: '#f7f7f7' },
    text: { primary: '#111', secondary: '#666' },
    error: { text: '#c00' },
  },
  spacing: (amount: number) => `${amount * 8}px`,
  shape: { radius: { default: '2px' } },
  typography: {
    h5: { fontSize: '14px' },
    fontWeightMedium: 500,
    bodySmall: { fontSize: '12px' },
    fontFamilyMonospace: 'monospace',
  },
  breakpoints: { down: (name: string) => `@media ${name}` },
} as unknown as GrafanaTheme2;

interface FieldProps {
  label?: string;
  description?: string;
  error?: string;
  invalid?: boolean;
  children?: ReactNode;
}

interface ButtonProps {
  children?: ReactNode;
  onClick?: () => void;
  'aria-label'?: string;
}

interface InputProps {
  'aria-label'?: string;
  placeholder?: string;
  value?: string | number;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  onBlur?: () => void;
}

interface ComboboxOption {
  label?: string;
  value: string;
  description?: string;
}

interface ComboboxProps {
  'aria-label'?: string;
  placeholder?: string;
  options: ComboboxOption[];
  value?: string | ComboboxOption | null;
  onChange: (option: ComboboxOption | null) => void;
  noOptionsMessage?: string;
}

export function uiModule() {
  return {
    useStyles2: (getter: (value: GrafanaTheme2) => unknown) => getter(theme),
    Alert: ({ title, children }: { title: string; children?: ReactNode }) => (
      <div role="alert">
        <strong>{title}</strong>
        {children}
      </div>
    ),
    Button: ({ children, onClick, ...props }: ButtonProps) => (
      <button type="button" aria-label={props['aria-label']} onClick={onClick}>
        {children}
      </button>
    ),
    Field: ({ label, description, error, children }: FieldProps) => (
      <label>
        <span>{label}</span>
        {description ? <span>{description}</span> : null}
        {children}
        {error ? <span role="alert">{error}</span> : null}
      </label>
    ),
    InlineField: ({ label, children }: { label: string; children?: ReactNode }) => (
      <label>
        {label}
        {children}
      </label>
    ),
    InlineSwitch: ({
      'aria-label': ariaLabel,
      value,
      onChange,
    }: {
      'aria-label'?: string;
      value?: boolean;
      onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
    }) => <input type="checkbox" aria-label={ariaLabel} checked={!!value} onChange={onChange} />,
    Input: ({ 'aria-label': ariaLabel, placeholder, value, onChange, onBlur }: InputProps) => (
      <input aria-label={ariaLabel} placeholder={placeholder} value={value ?? ''} onChange={onChange} onBlur={onBlur} />
    ),
    Stack: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    CodeEditor: ({ value, onChange, onBlur }: { value: string; onChange: (sql: string) => void; onBlur: (sql: string) => void }) => (
      <textarea aria-label="SQL editor" value={value} onChange={(event) => onChange(event.target.value)} onBlur={(event) => onBlur(event.target.value)} />
    ),
    Combobox: ({ 'aria-label': ariaLabel, placeholder, options, value, onChange, noOptionsMessage }: ComboboxProps) => {
      const current = typeof value === 'string' ? value : value?.value ?? '';
      const known = options.some((option) => option.value === current);
      const listed = !current || known ? options : [{ label: typeof value === 'object' ? value?.label : current, value: current }, ...options];
      return (
        <select
          aria-label={ariaLabel}
          value={current}
          onChange={(event) => onChange(options.find((option) => option.value === event.target.value) ?? null)}
        >
          <option value="">{options.length === 0 ? noOptionsMessage : placeholder}</option>
          {listed.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
              {option.description ? ` (${option.description})` : ''}
            </option>
          ))}
        </select>
      );
    },
  };
}
