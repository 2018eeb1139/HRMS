import React from 'react'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string
}

export function Input({ className = '', error, ...props }: InputProps) {
  return (
    <input
      className={[
        'block w-full rounded-md border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground bg-background',
        'focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500',
        'disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed',
        error ? 'border-red-400 focus:ring-red-400 focus:border-red-400' : 'border-input',
        className,
      ].join(' ')}
      {...props}
    />
  )
}
