"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  X, HelpCircle, Settings, ChevronDown, Upload, Trash2,
  User, Loader2, CheckCircle, AlertCircle, ArrowRight,
} from "lucide-react";

interface Recipient {
  id: number;
  name: string;
  email: string;
  deliveryEmail: boolean;
  deliverySms: boolean;
  phone: string;
  role: string;
}

let nextId = 2;

export default function SendEnvelopePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [docsOpen, setDocsOpen] = useState(true);
  const [recipOpen, setRecipOpen] = useState(true);
  const [recipients, setRecipients] = useState<Recipient[]>([
    { id: 1, name: "", email: "", deliveryEmail: true, deliverySms: false, phone: "", role: "Needs to Sign" },
  ]);
  const [emailSubject, setEmailSubject] = useState("");
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  // Bounce-back from DocuSign after using sender view
  const done = searchParams.get("done");
  useEffect(() => {
    if (done === "true") {
      showToast("Envelope sent successfully!", "success");
      setTimeout(() => router.push("/"), 2500);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  function showToast(msg: string, type: "success" | "error") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 5000);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) setFile(f);
  }

  function updateRecipient(id: number, patch: Partial<Recipient>) {
    setRecipients((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function addRecipient() {
    setRecipients((rs) => [
      ...rs,
      { id: nextId++, name: "", email: "", deliveryEmail: true, deliverySms: false, phone: "", role: "Needs to Sign" },
    ]);
  }

  function removeRecipient(id: number) {
    setRecipients((rs) => rs.filter((r) => r.id !== id));
  }

  function validate() {
    if (!file) { showToast("Please upload a document first.", "error"); return false; }
    for (const r of recipients) {
      if (!r.name.trim()) { showToast("All recipients need a name.", "error"); return false; }
      if (!r.email.trim() || !r.email.includes("@")) { showToast("All recipients need a valid email.", "error"); return false; }
    }
    return true;
  }

  async function submit(sendNow: boolean) {
    if (!validate()) return;
    setSending(true);
    try {
      const form = new FormData();
      form.append("document", file!);
      form.append("signerName", recipients[0].name);
      form.append("signerEmail", recipients[0].email);
      form.append("emailSubject", emailSubject || `Signature Required: ${file!.name}`);
      form.append("sendNow", String(sendNow));
      form.append("returnUrl", window.location.origin);

      const res = await fetch("/api/fax?path=send-envelope-manual", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create envelope");

      if (sendNow) {
        showToast("Envelope sent! Recipients will receive an email shortly.", "success");
        setTimeout(() => router.push("/"), 2500);
      } else {
        // Redirect to DocuSign sender view (same tab, no login)
        if (data.senderViewUrl) {
          window.location.href = data.senderViewUrl;
        } else {
          showToast("Envelope created as draft.", "success");
          setTimeout(() => router.push("/"), 2000);
        }
      }
    } catch (e: any) {
      showToast(e.message, "error");
    } finally {
      setSending(false);
    }
  }

  return (
    // Full-screen overlay covering the TopNav
    <div className="fixed inset-0 z-50 bg-[#f5f5f5] flex flex-col">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[60] flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
          toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
        }`}>
          {toast.type === "success" ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
          {toast.msg}
        </div>
      )}

      {/* Header bar */}
      <header className="h-14 bg-white border-b border-gray-200 flex items-center px-4 shrink-0">
        <button
          onClick={() => router.back()}
          className="mr-4 text-gray-500 hover:text-gray-800 transition-colors"
        >
          <X size={20} />
        </button>
        <span className="text-base font-semibold text-gray-900 flex-1">Set Up Envelope</span>

        <div className="flex items-center gap-2">
          <button className="text-gray-400 hover:text-gray-600 p-2">
            <HelpCircle size={18} />
          </button>
          <button className="text-gray-400 hover:text-gray-600 p-2">
            <Settings size={18} />
          </button>

          {/* Send Now split button */}
          <div className="flex items-center border border-gray-300 rounded-md overflow-hidden ml-2">
            <button
              onClick={() => submit(true)}
              disabled={sending}
              className="px-4 py-1.5 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 border-r border-gray-300 transition-colors"
            >
              {sending ? <Loader2 size={14} className="animate-spin" /> : "Send Now"}
            </button>
            <button className="px-2 py-1.5 text-sm text-gray-600 bg-white hover:bg-gray-50">
              <ChevronDown size={14} />
            </button>
          </div>

          {/* Next: Add Fields */}
          <button
            onClick={() => submit(false)}
            disabled={sending}
            className="flex items-center gap-2 px-5 py-1.5 text-sm font-semibold text-white rounded-md disabled:opacity-50 transition-colors"
            style={{ backgroundColor: "#4338ca" }}
          >
            {sending ? <Loader2 size={14} className="animate-spin" /> : (
              <>Next: Add Fields <ArrowRight size={14} /></>
            )}
          </button>
        </div>
      </header>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto py-6 px-6 space-y-0">

          {/* ── Add Documents ──────────────────────────────── */}
          <section className="bg-white border border-gray-200 rounded-xl mb-4">
            <button
              onClick={() => setDocsOpen((v) => !v)}
              className="w-full flex items-center justify-between px-6 py-4 text-left"
            >
              <span className="text-base font-semibold text-gray-900">Add documents</span>
              <ChevronDown size={18} className={`text-gray-500 transition-transform ${docsOpen ? "" : "-rotate-90"}`} />
            </button>

            {docsOpen && (
              <div className="px-6 pb-6">
                {/* Drop zone */}
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => !file && fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl py-14 flex flex-col items-center gap-4 transition-colors cursor-pointer ${
                    dragOver ? "border-indigo-400 bg-indigo-50" : "border-gray-300 bg-gray-50 hover:border-indigo-300"
                  }`}
                >
                  {file ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4338ca" strokeWidth="2">
                          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                          <polyline points="14 2 14 8 20 8"/>
                        </svg>
                      </div>
                      <p className="text-sm font-medium text-gray-800">{file.name}</p>
                      <p className="text-xs text-gray-400">{(file.size / 1024).toFixed(0)} KB</p>
                      <button
                        onClick={(e) => { e.stopPropagation(); setFile(null); }}
                        className="text-xs text-red-500 hover:underline mt-1"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="w-12 h-12 bg-gray-200 rounded-xl flex items-center justify-center">
                        <Upload size={22} className="text-gray-500" />
                      </div>
                      <p className="text-sm text-gray-600">Drop your files here or</p>
                      <button
                        onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                        className="flex items-center gap-1.5 text-sm font-semibold text-white px-5 py-2 rounded-lg"
                        style={{ backgroundColor: "#4338ca" }}
                      >
                        Upload <ChevronDown size={13} />
                      </button>
                    </>
                  )}
                </div>

                {/* Email subject */}
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email subject</label>
                  <input
                    type="text"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    placeholder={file ? `Signature Required: ${file.name}` : "Signature Required: your-document.pdf"}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder-gray-400 outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition"
                  />
                </div>
              </div>
            )}
          </section>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={handleFileInput}
          />

          {/* ── Add Recipients ──────────────────────────────── */}
          <section className="bg-white border border-gray-200 rounded-xl">
            <button
              onClick={() => setRecipOpen((v) => !v)}
              className="w-full flex items-center justify-between px-6 py-4 text-left"
            >
              <span className="text-base font-semibold text-gray-900">Add recipients</span>
              <ChevronDown size={18} className={`text-gray-500 transition-transform ${recipOpen ? "" : "-rotate-90"}`} />
            </button>

            {recipOpen && (
              <div className="px-6 pb-6">
                {/* Signing order + bulk send */}
                <div className="flex items-center gap-4 mb-5">
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input type="checkbox" className="rounded border-gray-300" />
                    Set signing order
                  </label>
                  <span className="text-gray-300">|</span>
                  <button className="text-sm font-medium text-indigo-600 hover:underline">View</button>
                  <span className="text-gray-300">|</span>
                  <button className="text-sm font-medium text-indigo-600 hover:underline">Bulk send</button>
                </div>

                {/* Recipient cards */}
                <div className="space-y-4">
                  {recipients.map((r, idx) => (
                    <div key={r.id} className="flex gap-0">
                      {/* Left color strip */}
                      <div className="w-1 rounded-l-lg shrink-0" style={{ backgroundColor: "#4338ca" }} />

                      {/* Card body */}
                      <div className="flex-1 border border-l-0 border-gray-200 rounded-r-lg p-5">
                        {/* Row 1: Name + role + delete */}
                        <div className="flex items-end gap-3 mb-4">
                          <div className="flex-1">
                            <label className="text-xs font-semibold text-gray-700 mb-1 block">
                              Name <span className="text-red-500">*</span>
                            </label>
                            <div className="flex items-center border border-gray-300 rounded-lg px-3 py-2 gap-2 focus-within:ring-2 focus-within:ring-indigo-200 focus-within:border-indigo-400 transition bg-white">
                              <User size={14} className="text-gray-400 shrink-0" />
                              <input
                                type="text"
                                value={r.name}
                                onChange={(e) => updateRecipient(r.id, { name: e.target.value })}
                                placeholder="Full name"
                                className="flex-1 text-sm text-gray-800 outline-none placeholder-gray-400 bg-transparent"
                              />
                            </div>
                          </div>

                          {/* Role dropdown */}
                          <button className="flex items-center gap-1.5 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white hover:bg-gray-50 whitespace-nowrap shrink-0">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                            {r.role} <ChevronDown size={12} className="text-gray-400" />
                          </button>

                          {/* Customize */}
                          <button className="flex items-center gap-1.5 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white hover:bg-gray-50 whitespace-nowrap shrink-0">
                            Customize <ChevronDown size={12} className="text-gray-400" />
                          </button>

                          {/* Delete */}
                          {recipients.length > 1 && (
                            <button
                              onClick={() => removeRecipient(r.id)}
                              className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>

                        {/* Row 2: Delivery */}
                        <div className="mb-3">
                          <label className="text-xs font-semibold text-gray-700 mb-2 block">
                            Delivery <span className="text-red-500">*</span>
                          </label>
                          <div className="flex items-center gap-4">
                            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={r.deliveryEmail}
                                onChange={(e) => updateRecipient(r.id, { deliveryEmail: e.target.checked })}
                                className="rounded border-gray-300 accent-indigo-600"
                              />
                              Email
                            </label>
                            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={r.deliverySms}
                                onChange={(e) => updateRecipient(r.id, { deliverySms: e.target.checked })}
                                className="rounded border-gray-300 accent-indigo-600"
                              />
                              SMS (Text)
                            </label>
                          </div>
                        </div>

                        {/* Row 3: Email input */}
                        {r.deliveryEmail && (
                          <div className="mb-3">
                            <input
                              type="email"
                              value={r.email}
                              onChange={(e) => updateRecipient(r.id, { email: e.target.value })}
                              placeholder="Email *"
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder-gray-400 outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition"
                            />
                          </div>
                        )}

                        {/* Row 4: Phone */}
                        {r.deliverySms && (
                          <div>
                            <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-indigo-200 focus-within:border-indigo-400 transition">
                              <span className="px-3 py-2 text-sm text-gray-500 border-r border-gray-300 bg-gray-50 shrink-0">+1</span>
                              <input
                                type="tel"
                                value={r.phone}
                                onChange={(e) => updateRecipient(r.id, { phone: e.target.value })}
                                placeholder="Phone number"
                                className="flex-1 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 outline-none bg-transparent"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add recipient */}
                <button
                  onClick={addRecipient}
                  className="mt-4 text-sm font-medium text-indigo-600 hover:text-indigo-800 hover:underline transition-colors"
                >
                  + Add Recipient
                </button>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
