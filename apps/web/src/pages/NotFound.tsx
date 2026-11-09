import { Link } from 'react-router-dom'
import { PageHeader, EmptyState, Button } from '../components/ui'

export function NotFound() {
  return (
    <>
      <PageHeader title="Page Not Found" />
      <EmptyState
        title="404 — Page not found"
        description="The page you're looking for doesn't exist or has been moved."
        actions={
          <Link to="/">
            <Button>Back to Dashboard</Button>
          </Link>
        }
      />
    </>
  )
}
