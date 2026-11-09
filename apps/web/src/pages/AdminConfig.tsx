import { useState, useEffect } from 'react'
import { apiGet, apiSend } from '../api/client'

type Department = { id: string; name: string }

export function AdminConfig() {
  const [departments, setDepartments] = useState<Department[]>([])
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const load = () => {
    apiGet<Department[]>('/config/departments')
      .then(setDepartments)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }
  useEffect(() => { load() }, [])

  const add = async () => {
    if (!name.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      await apiSend<Department>('/config/departments', 'POST', { name })
      setName('')
      load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <h2>Departments</h2>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <ul>{departments.map((d) => <li key={d.id}>{d.name}</li>)}</ul>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New department" />
      <button onClick={add} disabled={submitting}>Add</button>
    </div>
  )
}
