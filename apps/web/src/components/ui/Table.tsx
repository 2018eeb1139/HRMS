import React from 'react'

export function Table({ className = '', children, ...props }: React.HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto">
      <table className={`min-w-full divide-y divide-border text-sm ${className}`} {...props}>
        {children}
      </table>
    </div>
  )
}

export function Thead({ className = '', children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={`bg-muted ${className}`} {...props}>
      {children}
    </thead>
  )
}

export function Tbody({ className = '', children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={`divide-y divide-border bg-card ${className}`} {...props}>
      {children}
    </tbody>
  )
}

export function Tr({ className = '', children, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={`hover:bg-muted transition-colors ${className}`} {...props}>
      {children}
    </tr>
  )
}

export function Th({ className = '', children, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={`px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider ${className}`}
      {...props}
    >
      {children}
    </th>
  )
}

export function Td({ className = '', children, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={`px-4 py-3 text-foreground ${className}`} {...props}>
      {children}
    </td>
  )
}
