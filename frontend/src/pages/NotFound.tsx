import { Link } from "react-router-dom";
import { EmptyState } from "../components/ui";

export default function NotFound() {
  return (
    <div className="panel">
      <EmptyState title="Page not found" message="The page you are looking for does not exist or was moved." action={<Link to="/" className="btn-primary">Go to My work</Link>} />
    </div>
  );
}
