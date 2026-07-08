import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="empty">
      <h2 className="mb">Not found</h2>
      <p className="muted mb">That page does not exist.</p>
      <Link to="/" className="btn btn-subtle">
        Back to dashboard
      </Link>
    </div>
  )
}
