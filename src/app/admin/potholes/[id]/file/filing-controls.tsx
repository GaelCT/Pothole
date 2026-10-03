"use client";

import { createContext, useActionState, useContext, useState, useSyncExternalStore, type ReactNode } from "react";
import { saveFilingAction, type FilingState } from "./actions";
import { FormStatus } from "../form-status";

// ---------------------------------------------------------------------------
// Copy-ready field. The read-only box always works for selecting by hand; the
// Copy button appears only once JavaScript is running.

const noopSubscribe = () => () => {};
const useHydrated = () => useSyncExternalStore(noopSubscribe, () => true, () => false);

export function CopyField({ id, label, value, multiline = false }: { id: string; label: string; value: string; multiline?: boolean }) {
  const hydrated = useHydrated();
  const [copied, setCopied] = useState<"" | "ok" | "fail">("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied("ok");
    } catch {
      setCopied("fail");
    }
  }
  return (
    <div className="field copy-field">
      <label htmlFor={id}>{label}</label>
      {multiline ? (
        <textarea id={id} readOnly value={value} rows={Math.min(8, Math.ceil(value.length / 70) + 1)} />
      ) : (
        <input id={id} readOnly value={value} />
      )}
      {hydrated && (
        <div className="copy-row">
          <button type="button" className="secondary" onClick={copy}>
            Copy<span className="visually-hidden"> {label}</span>
          </button>
          <span role="status" aria-live="polite" className={copied === "fail" ? "error" : "success"}>
            {copied === "ok" ? "Copied." : copied === "fail" ? "Copy failed. Select the text instead." : ""}
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filing steps: one hook and one result line for every form on the page.

type Ctx = { potholeId: string; formAction: (form: FormData) => void; pending: boolean };
const FilingContext = createContext<Ctx | null>(null);

function useFiling(): Ctx {
  const value = useContext(FilingContext);
  if (!value) throw new Error("Filing forms must be inside <FilingControls>.");
  return value;
}

export function FilingControls({ potholeId, children }: { potholeId: string; children: ReactNode }) {
  const [state, formAction, pending] = useActionState<FilingState, FormData>(saveFilingAction, undefined);
  return (
    <FilingContext.Provider value={{ potholeId, formAction, pending }}>
      <FormStatus state={state} />
      {children}
    </FilingContext.Provider>
  );
}

function FilingForm({
  intent,
  children,
  button,
  pendingLabel,
  secondary,
  multipart,
}: {
  intent: string;
  children?: ReactNode;
  button: string;
  pendingLabel: string;
  secondary?: boolean;
  multipart?: boolean;
}) {
  const { potholeId, formAction, pending } = useFiling();
  return (
    <form action={formAction} className="stack wide filing-form" encType={multipart ? "multipart/form-data" : undefined}>
      <input type="hidden" name="pothole_id" value={potholeId} />
      <input type="hidden" name="filing_intent" value={intent} />
      {children}
      <button type="submit" className={secondary ? "secondary" : undefined} disabled={pending}>
        {pending ? pendingLabel : button}
      </button>
    </form>
  );
}

function Notes({ id }: { id: string }) {
  return (
    <div className="field">
      <label htmlFor={id}>
        Notes <span className="hint">(optional)</span>
      </label>
      <textarea id={id} name="notes" rows={2} maxLength={1000} />
    </div>
  );
}

function Confirm({ id, children }: { id: string; children: ReactNode }) {
  return (
    <label className="check" htmlFor={id}>
      <input id={id} type="checkbox" name="confirm" required />
      {children}
    </label>
  );
}

function CityReference({ prefix, requireOne }: { prefix: string; requireOne?: boolean }) {
  return (
    <div className="row">
      <div className="field">
        <label htmlFor={`${prefix}-rid`}>
          City request number <span className="hint">(only if the city showed one)</span>
        </label>
        <input id={`${prefix}-rid`} name="city_request_id" maxLength={100} />
      </div>
      <div className="field">
        <label htmlFor={`${prefix}-url`}>
          City request link <span className="hint">(only if shown)</span>
        </label>
        <input id={`${prefix}-url`} name="city_request_url" type="url" maxLength={500} placeholder="https://" />
      </div>
      {requireOne && <p className="hint">Enter at least one of the two.</p>}
    </div>
  );
}

export function StartFilingForm() {
  return <FilingForm intent="start" button="Start filing (locks this record)" pendingLabel="Starting…" />;
}

export function SubmittedForm({ heading }: { heading: string }) {
  return (
    <section className="outcome" aria-label={heading}>
      <h3>{heading}</h3>
      <FilingForm intent="submitted" button="Record as submitted" pendingLabel="Saving…" multipart>
        <CityReference prefix="sub" />
        <div className="field">
          <label htmlFor="sub-receipt">
            Screenshot of the city&apos;s confirmation <span className="hint">(optional, JPEG/PNG/WebP, up to 5 MB, kept private)</span>
          </label>
          <input id="sub-receipt" name="receipt" type="file" accept="image/jpeg,image/png,image/webp" />
        </div>
        <Notes id="sub-notes" />
        <Confirm id="sub-confirm">I saw the city&apos;s confirmation that this request was received.</Confirm>
      </FilingForm>
    </section>
  );
}

export function ExistingForm({ heading }: { heading: string }) {
  return (
    <section className="outcome" aria-label={heading}>
      <h3>{heading}</h3>
      <p className="hint">
        Use this when the city showed a possible duplicate and you confirmed it is this pothole, so you
        did not file a new request.
      </p>
      <FilingForm intent="existing" button="Link existing city request" pendingLabel="Saving…" secondary>
        <CityReference prefix="ex" requireOne />
        <Notes id="ex-notes" />
        <Confirm id="ex-confirm">The existing city request is for this same pothole, and I did not submit a new one.</Confirm>
      </FilingForm>
    </section>
  );
}

export function UnknownForm() {
  return (
    <section className="outcome" aria-label="Outcome unclear">
      <h3>The result is unclear</h3>
      <p className="hint">
        For example, the page froze or closed after you pressed Submit. The record stays locked until
        you check the city&apos;s request history. Nothing is retried.
      </p>
      <FilingForm intent="unknown" button="Record outcome unknown" pendingLabel="Saving…" secondary>
        <Notes id="unk-notes" />
      </FilingForm>
    </section>
  );
}

export function AbandonedForm({ afterUnknown }: { afterUnknown: boolean }) {
  const heading = afterUnknown ? "It is not in the city's history" : "Nothing was sent";
  return (
    <section className="outcome" aria-label={heading}>
      <h3>{heading}</h3>
      <FilingForm intent="abandoned" button="Record as not sent" pendingLabel="Saving…" secondary>
        <Notes id="ab-notes" />
        <Confirm id="ab-confirm">
          {afterUnknown
            ? "I checked the city's request history and this report is not there."
            : "I did not submit anything to the city for this record."}
        </Confirm>
      </FilingForm>
    </section>
  );
}
