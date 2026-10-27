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
        <p>This notice describes the current local AgentBridge workspace. Use sample information when exploring it.</p>
        <section>
          <h2>What the workspace saves</h2>
          <p>Listings, quotes, bookings, saved preferences, and assistant conversations are stored in the app’s local database. Business and customer views share these records within your workspace.</p>
        </section>
        <section>
          <h2>Your browser session</h2>
          <p>A session cookie identifies your workspace. It is not a verified user account. Clearing the cookie starts a new workspace and does not delete the earlier records from the database.</p>
        </section>
        <section>
          <h2>Assistant requests</h2>
          <p>In offline mode, the app processes requests locally using scripted logic. If a live model is configured, messages, recent conversation context, saved preferences, and relevant listing information may be sent to the configured model provider to answer your request.</p>
        </section>
        <section>
          <h2>External resources</h2>
          <p>Room photographs and fonts may load from external services, including Unsplash and Google Fonts. Those services receive the normal network request needed to deliver the resource. No analytics or advertising tools are configured in this app.</p>
        </section>
        <section>
          <h2>Data controls</h2>
          <p>You can change or reset saved preferences in the app. This version does not provide account deletion or a complete data deletion control. Records remain in the local database until the person running the app removes them.</p>
        </section>
        <Link className="utility-back" href="/">Return to your workspace</Link>
        <Link href="/terms">Workspace terms</Link>
      </main>
    </div>
  );
}
