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
          <h2>Test bookings and service quotes</h2>
          <p>Businesses, rooms, bookings, and service offers in this app are fictional tests. A booking confirmation or service quote approval records test acceptance inside the app. It does not reserve a real room, schedule an appointment, authorize work, place an order, or collect a payment.</p>
        </section>
        <section>
          <h2>Approval stays with you</h2>
          <p>Review the service scope, itemized price, and any dates or booking terms before approving. The assistant can find offers and prepare quotes. The app requires your explicit approval to accept a test service quote or confirm, change, or cancel a test reservation. A chat message such as “yes” does not approve an action.</p>
        </section>
        <section>
          <h2>What is connected</h2>
          <p>Published business agents can be discovered by other customers. Connected room agents support test bookings, and business agents with saved service prices can prepare test service quotes. Personal skills remain private. External agent links are references only; uploaded instructions are not executed. Live hotel inventory, real appointments, verified business accounts, and payments are not connected.</p>
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
