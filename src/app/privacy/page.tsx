import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy notice · AgentBridge",
  description: "How the current AgentBridge workspace stores and uses information.",
};

export default function PrivacyPage() {
  return (
    <div className="utility-page">
      <Link className="utility-brand" href="/">AgentBridge</Link>
      <main className="utility-content" id="main-content">
        <h1>Privacy notice</h1>
        <p>This notice describes the AgentBridge test app. Use fictional business and customer information when exploring it.</p>
        <section>
          <h2>What the workspace saves</h2>
          <p>The server saves agent profiles and instructions, listings, quotes, test bookings, preferences, and conversations. It uses a local SQLite database or a Turso database when the operator configures it. Storage on a free host’s local filesystem can reset after a restart or deployment.</p>
        </section>
        <section>
          <h2>Published businesses and private conversations</h2>
          <p>Business agents start private. If you choose to let other customers discover a business, its profile, offers, and room availability become discoverable across workspaces. Personal entries, conversations, preferences, and customer approvals stay private to their workspace. A room’s business owner can see the test reservation details, including dates, guests, price, and status.</p>
          <p>Only the owner can edit or download an agent’s instructions. The AI uses those instructions as reference material when answering customers; they are not a place to store secrets.</p>
        </section>
        <section>
          <h2>Your browser session</h2>
          <p>A session cookie identifies your workspace. It is not a verified user account. Clearing the cookie starts a new workspace and does not delete the earlier records from the database.</p>
        </section>
        <section>
          <h2>Assistant requests</h2>
          <p>The offline personal assistant uses scripted logic on the server. When Nebius AI is configured, messages, recent conversation context, relevant preferences, offers, and the selected agent’s instructions may be sent to Nebius to answer your request. Private workspace content is not a secret vault; do not include passwords, access codes, or sensitive personal details.</p>
        </section>
        <section>
          <h2>External resources</h2>
          <p>Room photographs and fonts may load from external services, including Unsplash and Google Fonts. Those services receive the normal network request needed to deliver the resource. No analytics or advertising tools are configured in this app.</p>
        </section>
        <section>
          <h2>Data controls</h2>
          <p>You can edit your agents, make a published business private again, and change or reset saved preferences. Making a business private stops new discovery; it does not erase saved records. This version has no complete account or data deletion control. Stored records are managed by the person running the app.</p>
        </section>
        <Link className="utility-back" href="/">Return to your workspace</Link>
        <Link href="/terms">Workspace terms</Link>
      </main>
    </div>
  );
}
