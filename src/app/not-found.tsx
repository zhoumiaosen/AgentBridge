import Link from "next/link";

export default function NotFound() {
  return (
    <div className="utility-page">
      <Link className="utility-brand" href="/">AgentBridge</Link>
      <main className="utility-content" id="main-content">
        <p>404</p>
        <h1>This page is not here.</h1>
        <p>Your workspace is still available. Return home to continue.</p>
        <Link className="utility-back" href="/">Return to your workspace</Link>
      </main>
    </div>
  );
}
