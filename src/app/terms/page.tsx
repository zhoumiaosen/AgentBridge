import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Workspace terms · AgentBridge",
  description: "What the current AgentBridge workspace supports and how to use it.",
};

export default function TermsPage() {
  return (
    <div className="utility-page">
      <Link className="utility-brand" href="/">AgentBridge</Link>
      <main className="utility-content" id="main-content">
        <h1>Workspace terms</h1>
        <p>AgentBridge is a working prototype for connecting businesses with people through personal AI. These notes explain the current workspace’s scope.</p>
        <section>
          <h2>Sample listings and reservations</h2>
          <p>Properties and bookings in this workspace are samples. A confirmation records an action inside the app. It does not reserve a real hotel room, create an agreement with a property, or collect a payment.</p>
        </section>
        <section>
          <h2>Approval stays with you</h2>
          <p>Review the dates, guests, price, and cancellation terms before approving a booking or change. The assistant can help find an offer and prepare actions, but the app requires your explicit approval to confirm, change, or cancel a reservation.</p>
        </section>
        <section>
          <h2>What is connected</h2>
          <p>Accommodation is the current category. External personal assistants, live hotel inventory, verified business accounts, and payments are not connected. An offline label means that a live AI model is not configured.</p>
        </section>
        <section>
          <h2>Use sample information</h2>
          <p>Do not enter payment details, identity documents, or other sensitive personal information. Use fictional details for rooms and businesses you add. See the privacy notice for how the workspace stores information.</p>
        </section>
        <Link className="utility-back" href="/">Return to your workspace</Link>
        <Link href="/privacy">Privacy notice</Link>
      </main>
    </div>
  );
}
