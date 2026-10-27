"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import AgentConversation from "./agent-conversation";
import { MagnifyingGlassIcon as Search } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { PlusIcon as Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { XIcon as X } from "@phosphor-icons/react/dist/csr/X";
import { SparkleIcon as Sparkles } from "@phosphor-icons/react/dist/csr/Sparkle";
import { UploadSimpleIcon as Upload } from "@phosphor-icons/react/dist/csr/UploadSimple";
import { ArrowSquareOutIcon as ExternalLink } from "@phosphor-icons/react/dist/csr/ArrowSquareOut";

export type LibrarySkill = {
  id: string;
  name: string;
  ownerType: "business" | "customer";
  ownerName: string;
  kind: "agent" | "skill";
  category: string;
  summary: string;
  content?: string;
  agentUrl?: string;
  source: "example" | "custom" | "connected";
  version: number;
  updatedAt: string;
  businessId?: string;
};
type Draft = Pick<LibrarySkill, "name" | "ownerType" | "ownerName" | "kind" | "category" | "summary" | "agentUrl"> & { content: string };
const emptyDraft: Draft = { name: "", ownerType: "business", ownerName: "", kind: "skill", category: "General", summary: "", content: "", agentUrl: "" };
const sourceLabel = { example: "Example", custom: "Your entry", connected: "Connected" };
async function libraryApi(path = "", method = "GET", body?: unknown) {
  const response = await fetch(`/api/skills${path}`, {
    method,
    cache: "no-store",
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Could not load this entry. Please retry.");
  return data;
}
function toDraft(skill: Partial<Draft>): Draft {
  return {
    name: skill.name || "", ownerType: skill.ownerType === "customer" ? "customer" : "business",
    ownerName: skill.ownerName || "", kind: skill.kind === "agent" ? "agent" : "skill",
    category: skill.category || "General", summary: skill.summary || "", content: skill.content || "", agentUrl: skill.agentUrl || "",
  };
}
export default function SkillsLibrary({ onManageBusiness, onNotify, businessRevision, openAgentId, onAgentOpened, onReservationChange }: {
  onManageBusiness: (businessId: string) => void;
  onNotify: (message: string) => void;
  businessRevision: string;
  openAgentId?: string;
  onAgentOpened?: () => void;
  onReservationChange?: () => void;
}) {
  const [skills, setSkills] = useState<LibrarySkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [panel, setPanel] = useState<"details" | "editor" | "chat" | null>(null);
  const [selected, setSelected] = useState<LibrarySkill | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [imported, setImported] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [searchError, setSearchError] = useState("");
  const [highlight, setHighlight] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const detailRequest = useRef(0);
  const searchRequest = useRef(0);
  const open = panel !== null;
  useEffect(() => {
    const request = ++searchRequest.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      const params = new URLSearchParams({ metadata: "1" });
      if (query.trim()) params.set("q", query.trim());
      if (ownerFilter !== "all") params.set("ownerType", ownerFilter);
      try {
        const data = await libraryApi(`?${params}`);
        if (request === searchRequest.current) { setSkills(data.skills); setSearchError(""); }
      } catch (err) {
        if (request === searchRequest.current) { setSkills([]); setSearchError(err instanceof Error ? err.message : "Could not search Agent Hub."); }
      } finally {
        if (request === searchRequest.current) setLoading(false);
      }
    }, 250);
    return () => { clearTimeout(timer); searchRequest.current++; };
  }, [query, ownerFilter, businessRevision, refreshVersion]);
  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element?.showModal();
    closeButton.current?.focus({ preventScroll: true });
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
      if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true });
    };
  }, [open]);
  const rememberFocus = () => { if (document.activeElement instanceof HTMLElement) returnFocus.current = document.activeElement; };
  const close = () => { if (!busy) { detailRequest.current++; setPanel(null); setError(""); } };
  const viewDetails = async (skill: LibrarySkill) => {
    rememberFocus();
    const request = ++detailRequest.current;
    setSelected(skill); setError(""); setPanel("details");
    try {
      const data = await libraryApi(`/${encodeURIComponent(skill.id)}?metadata=1`);
      if (request === detailRequest.current) setSelected(data.skill);
    } catch (err) {
      if (request === detailRequest.current) setError(err instanceof Error ? err.message : "Could not load this entry.");
    }
  };
  const create = () => {
    detailRequest.current++;
    if (!open) rememberFocus();
    setSelected(null); setDraft({ ...emptyDraft });
    setImported(false); setError(""); setPanel("editor");
  };
  const edit = async (skill: LibrarySkill, asTemplate = false) => {
    if (busy) return;
    const request = ++detailRequest.current;
    if (!open) rememberFocus();
    setBusy("load"); setError("");
    try {
      const data = await libraryApi(`/${encodeURIComponent(skill.id)}`);
      if (request !== detailRequest.current) return;
      setSelected(asTemplate ? null : data.skill);
      setDraft({ ...toDraft(data.skill), ...(asTemplate ? { name: `${data.skill.name} copy`.slice(0, 100) } : {}) });
      setImported(false); setPanel("editor");
    } catch (err) {
      if (request === detailRequest.current) setError(err instanceof Error ? err.message : "Could not load the saved instructions.");
    } finally { if (request === detailRequest.current) setBusy(""); }
  };
  const chat = (skill: LibrarySkill) => {
    if (busy) return;
    if (!open) rememberFocus();
    detailRequest.current++; setSelected(skill); setError(""); setPanel("chat");
  };
  useEffect(() => {
    if (!openAgentId) return;
    const request = ++detailRequest.current;
    let active = true;
    setError("");
    libraryApi(`/${encodeURIComponent(openAgentId)}?metadata=1`)
      .then(data => {
        if (active && request === detailRequest.current) {
          rememberFocus(); setSelected(data.skill); setPanel("chat");
        }
      })
      .catch(err => { if (active && request === detailRequest.current) setError(err.message || "Could not open this agent."); })
      .finally(() => { if (active) onAgentOpened?.(); });
    return () => { active = false; };
  }, [openAgentId]);
  const change = <K extends keyof Draft>(field: K, value: Draft[K]) => setDraft(current => ({ ...current, [field]: value }));
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy("save"); setError("");
    try {
      const data = await libraryApi(selected ? `/${encodeURIComponent(selected.id)}` : "", selected ? "PATCH" : "POST", {
        ...draft, ...(selected ? { version: selected.version } : {}),
      });
      const saved: LibrarySkill = data.skill;
      setQuery(""); setOwnerFilter("all"); setHighlight(saved.id); setPanel(null);
      setRefreshVersion(current => current + 1);
      onNotify(selected ? "Your entry is updated." : "Your entry is published in Agent Hub.");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save. Your changes are still here."); }
    finally { setBusy(""); }
  };
  const reloadLatest = async () => {
    if (!selected || busy) return;
    setBusy("reload"); setError("");
    try {
      const data = await libraryApi(`/${encodeURIComponent(selected.id)}`);
      setSelected(data.skill); setDraft(toDraft(data.skill));
      setRefreshVersion(current => current + 1);
      onNotify("The saved version is loaded. Your unsaved changes were replaced.");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not reload this entry."); }
    finally { setBusy(""); }
  };
  const importFile = async (file?: File) => {
    if (!file || busy) return;
    rememberFocus(); setBusy("import"); setError("");
    try {
      if (!/\.(md|json)$/i.test(file.name)) throw new Error("Choose a Markdown (.md) or JSON (.json) file.");
      if (file.size > 24000) throw new Error("Choose a file smaller than 24,000 bytes.");
      const data = await libraryApi("/import", "POST", { filename: file.name, text: await file.text() });
      setDraft(toDraft(data.draft)); setSelected(null); setImported(true); setPanel("editor");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not read this file."); }
    finally { setBusy(""); if (fileInput.current) fileInput.current.value = ""; }
  };
  const manage = (skill: LibrarySkill) => {
    if (!skill.businessId || busy) return;
    detailRequest.current++; setPanel(null); setError(""); onManageBusiness(skill.businessId);
  };
  return <section className="skills-library" aria-labelledby="skills-heading">
    <div className="page-heading">
      <div><span className="eyebrow">A growing network</span><h1 id="skills-heading">Agent Hub</h1><p>Find a business agent or personal skill, then start a conversation.</p></div>
      <div className="library-header-actions">
        <button className="outline-button" disabled={!!busy} onClick={() => fileInput.current?.click()}><Upload size={18} />{busy === "import" ? "Reading file…" : "Import file"}</button>
        <button className="primary-button" disabled={!!busy} onClick={() => create()}><Plus size={18} />Add agent or skill</button>
        <input ref={fileInput} className="sr-only" type="file" accept=".md,.json" aria-label="Import skill file" tabIndex={-1} onChange={event => importFile(event.target.files?.[0])} />
      </div>
    </div>
    {(error || searchError) && !open && <div className="error-banner" role="alert">{error || searchError}<button className="text-button" onClick={() => { setError(""); setSearchError(""); setRefreshVersion(current => current + 1); }}>Retry</button></div>}
    <div className="library-toolbar">
      <label className="library-search"><Search size={18} /><input type="search" aria-label="Search agents and skills" maxLength={200} placeholder="Search by name, owner, or category" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <div className="library-filters" role="group" aria-label="Filter by owner">{[{ value: "all", label: "All" }, { value: "business", label: "Business" }, { value: "customer", label: "Personal" }].map(filter => <button key={filter.value} aria-pressed={ownerFilter === filter.value} onClick={() => setOwnerFilter(filter.value)}>{filter.label}</button>)}</div>
    </div>
    <p className="library-explainer">Search saved profiles and choose who to talk to. Conversations use the selected profile’s guidance; uploaded instructions stay in the editor.</p>
    {loading ? <div className="empty-state" role="status">Searching Agent Hub…</div> : skills.length === 0 ? <div className="empty-state"><Search size={28} /><h2>No matching entries</h2><p>Try a different search or add your own agent or skill.</p></div> : <div className="library-grid">{skills.map(skill => <article key={skill.id} className={`library-card ${highlight === skill.id ? "library-card-new" : ""}`}>
      <div className="library-card-top"><span className="library-kind"><Sparkles size={18} />{skill.kind === "agent" ? "Agent" : "Skill"}</span><span className={`library-source source-${skill.source}`}>{sourceLabel[skill.source]}</span></div>
      <h2>{skill.name}</h2><p className="library-owner">{skill.ownerType === "business" ? "Business" : "Personal"} · {skill.ownerName}</p><span className="library-category">{skill.category}</span>
      <p className="library-summary">{skill.summary || "Start a conversation to learn how this agent can help."}</p>
      {skill.agentUrl && <small className="library-link-note">Link registered · Not connected</small>}
      <div className="library-card-actions"><button className="primary-button" disabled={!!busy} onClick={() => chat(skill)} aria-label={`Chat with ${skill.name}`}>Start conversation</button><button className="outline-button" disabled={!!busy} onClick={() => viewDetails(skill)} aria-label={`View ${skill.name}`}>View details</button>{skill.source === "custom" && <button className="text-button" disabled={!!busy} onClick={() => edit(skill)} aria-label={`Edit ${skill.name}`}>Edit entry</button>}{skill.source === "connected" && skill.businessId && <button className="text-button" disabled={!!busy} onClick={() => manage(skill)} aria-label={`Manage ${skill.name}`}>Manage agent</button>}</div>
    </article>)}</div>}
    <dialog ref={dialog} className={`modal library-dialog${panel === "chat" ? " agent-chat-dialog" : ""}`} aria-labelledby="library-dialog-title" onCancel={event => { event.preventDefault(); close(); }}>
      <button ref={closeButton} className="modal-close icon-button" aria-label="Close Agent Hub dialog" disabled={!!busy} onClick={close}><X size={21} /></button>
      {panel === "chat" && selected && <AgentConversation key={selected.id} initialAgent={selected} onBack={close} onReservationChange={onReservationChange} />}
      {panel === "details" && selected && <>
        <span className="eyebrow">{sourceLabel[selected.source]} · {selected.kind === "agent" ? "Agent profile" : "Skill"}</span>
        <h2 id="library-dialog-title">{selected.name}</h2>
        <p className="modal-intro">{selected.ownerType === "business" ? "Business" : "Personal"} · {selected.ownerName} · {selected.category}</p>
        <p className="library-detail-summary">{selected.summary}</p>
        <button className="primary-button" disabled={!!busy} onClick={() => chat(selected)} aria-label={`Chat with ${selected.name}`}>Start conversation</button>
        {selected.agentUrl && <div className="notice"><span>This link is registered for reference. AgentBridge has not connected to or run this external agent. <a href={selected.agentUrl} target="_blank" rel="noopener noreferrer">Open registered link <ExternalLink size={14} /></a></span></div>}
        <p className="library-version">Version {selected.version} · Saved {new Date(selected.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
        <div className="library-detail-actions">{selected.source === "custom" ? <button className="primary-button" disabled={!!busy} onClick={() => edit(selected)}>Edit entry</button> : selected.source === "connected" && selected.businessId ? <button className="primary-button" disabled={!!busy} onClick={() => manage(selected)}>Manage agent</button> : <button className="primary-button" disabled={!!busy} onClick={() => edit(selected, true)}>Use as template</button>}<a className="text-button" href={`/api/skills/${encodeURIComponent(selected.id)}?download=1`}>Download entry <ExternalLink size={16} /></a></div>
      </>}
      {panel === "editor" && <>
        <span className="eyebrow">{imported ? "Review before publishing" : selected ? "Your Agent Hub entry" : "Contribute to the network"}</span>
        <h2 id="library-dialog-title">{imported ? "Review imported entry" : selected ? "Edit entry" : "Add agent or skill"}</h2>
        <p className="modal-intro">{imported ? "Your file has been read as text. Check the details and instructions below before publishing." : "Describe how this agent should help. Its name and description appear in search; these instructions guide its conversations."}</p>
        <form className="library-form" onSubmit={save}>
          <label className="form-field"><span>Name</span><input aria-label="Entry name" name="name" value={draft.name} maxLength={100} required onChange={event => change("name", event.target.value)} /></label>
          <div className="form-grid"><label className="form-field"><span>Entry type</span><select aria-label="Entry type" name="kind" value={draft.kind} onChange={event => change("kind", event.target.value as Draft["kind"])}><option value="skill">Skill · Reusable instructions</option><option value="agent">Agent · Profile and capabilities</option></select></label><label className="form-field"><span>Owner type</span><select aria-label="Owner type" name="ownerType" value={draft.ownerType} onChange={event => change("ownerType", event.target.value as Draft["ownerType"])}><option value="business">Business</option><option value="customer">Personal</option></select></label></div>
          <label className="form-field"><span>{draft.ownerType === "business" ? "Business or owner name" : "Owner name"}</span><input aria-label="Owner name" name="ownerName" value={draft.ownerName} maxLength={80} required onChange={event => change("ownerName", event.target.value)} /></label>
          <label className="form-field"><span>Category</span><input aria-label="Category" name="category" value={draft.category} maxLength={60} required placeholder="Travel, support, operations…" onChange={event => change("category", event.target.value)} /></label>
          <label className="form-field"><span>Short description</span><textarea aria-label="Short description" name="summary" value={draft.summary} maxLength={240} rows={3} required onChange={event => change("summary", event.target.value)} /><small className="field-help">What does this agent or skill help with? <span>{draft.summary.length}/240</span></small></label>
          <label className="form-field"><span>{draft.kind === "agent" ? "Profile & instructions" : "Instructions"}</span><textarea aria-label="Instructions" name="content" value={draft.content} maxLength={12000} rows={10} required onChange={event => change("content", event.target.value)} /><small className="field-help">Keep passwords and private details out. <span>{draft.content.length.toLocaleString()}/12,000</span></small></label>
          <label className="form-field"><span>External agent link (optional)</span><input aria-label="External agent link" name="agentUrl" type="url" pattern="https://.*" value={draft.agentUrl || ""} placeholder="https://…" onChange={event => change("agentUrl", event.target.value)} /><small className="field-help">A reference link only. This does not connect or run the agent.</small></label>
          {selected && <p className="library-version">Editing version {selected.version}</p>}
          {error && <div className="modal-error" role="alert">{error}</div>}
          <button className="primary-button full-button" type="submit" disabled={!!busy}>{busy === "save" ? "Saving…" : selected ? "Save changes" : "Publish entry"}</button>
          {selected && <><button className="text-button" type="button" disabled={!!busy} onClick={reloadLatest}>{busy === "reload" ? "Loading saved version…" : "Reload saved version"}</button>{error && <p className="fine-print">Reloading replaces your unsaved edits.</p>}</>}
        </form>
      </>}
      {panel === "details" && error && <div className="modal-error" role="alert">{error}</div>}
    </dialog>
  </section>;
}
