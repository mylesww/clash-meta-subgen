import type { ReactNode } from "react";

interface FieldProps {
  id: string;
  label: string;
  parameter?: string;
  hint: string;
  error?: string;
  children: ReactNode;
}

export function Field({
  id,
  label,
  parameter,
  hint,
  error,
  children,
}: FieldProps) {
  return (
    <div className="field">
      <div className="field-heading">
        <label htmlFor={id}>{label}</label>
        {parameter && <span className="parameter">{parameter}</span>}
      </div>
      {children}
      <p className={error ? "field-error" : "field-hint"} id={`${id}-hint`}>
        {error || hint}
      </p>
    </div>
  );
}
