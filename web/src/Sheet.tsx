import { useCallback, useId, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

const HISTORY_KEY = "lotteryEdgePages";
let pageSequence = 0;
const openPages: string[] = [];
let savedBodyOverflow = "";
let savedHtmlOverflow = "";
let savedRootInert = false;
let savedWindowScrollY = 0;

function syncPageStack() {
  const top = openPages.at(-1);
  const root = document.getElementById("root");

  if (root) root.inert = openPages.length > 0 || savedRootInert;
  document.querySelectorAll<HTMLElement>("[data-app-page]").forEach((page) => {
    const hidden = page.dataset.pageId !== top;
    page.inert = hidden;
    if (hidden) page.setAttribute("aria-hidden", "true");
    else page.removeAttribute("aria-hidden");
  });
}

export type PageBack = () => void;

export function pageStackFromState(state: unknown): string[] {
  if (!state || typeof state !== "object") return [];
  const value = (state as Record<string, unknown>)[HISTORY_KEY];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function pageIsHistoryTop(pageId: string, state: unknown): boolean {
  return pageStackFromState(state).at(-1) === pageId;
}

/**
 * Shared edge-to-edge internal destination. Each mounted page adds a same-URL
 * history entry, so its Back control, Escape, and browser Back all unwind one
 * level without introducing GitHub Pages routes. Nested pages stay mounted and
 * retain their own scroll and form state.
 */
export function FullPage({
  label,
  title = label,
  subtitle,
  actions,
  onClose,
  className,
  children,
}: {
  label: string;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  onClose: () => void;
  className?: string;
  children: React.ReactNode | ((back: PageBack) => React.ReactNode);
}) {
  const headingId = useId();
  const pageId = useRef(`page-${++pageSequence}`).current;
  const layer = useRef(100 + pageSequence).current;
  const titleRef = useRef<HTMLHeadingElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const closedRef = useRef(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const closeNow = useCallback(() => {
    if (closedRef.current) return false;
    closedRef.current = true;
    closeRef.current();
    return true;
  }, []);

  const back = useCallback(() => {
    if (!closeNow()) return;
    if (pageIsHistoryTop(pageId, window.history.state)) {
      window.history.back();
      // Some embedded browsers can swallow a traversal. The page is already
      // closed; clean only its stale marker so the next Back remains safe.
      window.setTimeout(() => {
        if (!pageIsHistoryTop(pageId, window.history.state)) return;
        const state = window.history.state as Record<string, unknown>;
        window.history.replaceState(
          { ...state, [HISTORY_KEY]: pageStackFromState(state).filter((id) => id !== pageId) },
          "",
          window.location.href,
        );
      }, 180);
    } else {
      const state = window.history.state;
      const objectState = state && typeof state === "object" ? state : {};
      window.history.replaceState(
        { ...objectState, [HISTORY_KEY]: pageStackFromState(state).filter((id) => id !== pageId) },
        "",
        window.location.href,
      );
    }
  }, [closeNow, pageId]);

  useLayoutEffect(() => {
    openerRef.current = document.activeElement as HTMLElement | null;

    if (openPages.length === 0) {
      savedBodyOverflow = document.body.style.overflow;
      savedHtmlOverflow = document.documentElement.style.overflow;
      savedRootInert = document.getElementById("root")?.inert ?? false;
      savedWindowScrollY = window.scrollY;
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
    }

    const previous = window.history.state;
    let state = previous && typeof previous === "object" ? previous : {};
    const currentStack = pageStackFromState(state);
    // A reload/Forward can leave a same-URL marker with no mounted page.
    // Sanitize it before creating the first real destination.
    if (
      openPages.length === 0 &&
      currentStack.length > 0 &&
      !(currentStack.length === 1 && currentStack[0] === pageId)
    ) {
      state = { ...state, [HISTORY_KEY]: [] };
      window.history.replaceState(state, "", window.location.href);
    }

    openPages.push(pageId);
    const expectedStack = [...openPages];
    // React StrictMode mounts effects twice in development. Reuse the entry
    // created by the first pass instead of requiring two Back presses.
    if (pageStackFromState(state).join("|") !== expectedStack.join("|")) {
      window.history.pushState({ ...state, [HISTORY_KEY]: expectedStack }, "", window.location.href);
    }
    syncPageStack();
    titleRef.current?.focus();

    const onPopState = () => {
      if (!pageIsHistoryTop(pageId, window.history.state)) closeNow();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && openPages.at(-1) === pageId) {
        event.preventDefault();
        back();
      }
    };
    window.addEventListener("popstate", onPopState);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("keydown", onKeyDown);
      const index = openPages.lastIndexOf(pageId);
      if (index >= 0) openPages.splice(index, 1);
      syncPageStack();

      if (openPages.length === 0) {
        document.body.style.overflow = savedBodyOverflow;
        document.documentElement.style.overflow = savedHtmlOverflow;
      }
      openerRef.current?.focus?.({ preventScroll: true });
      if (openPages.length === 0) {
        window.scrollTo({ top: savedWindowScrollY, left: 0, behavior: "auto" });
      }
    };
  }, [back, closeNow, pageId]);

  const content = typeof children === "function" ? children(back) : children;

  return createPortal(
    <section
      className={`page-shell ${className ?? ""}`}
      data-app-page
      data-page-id={pageId}
      aria-labelledby={headingId}
      style={{ zIndex: layer }}
    >
      <header className="page-header">
        <button className="page-back" onClick={back} aria-label={`Back from ${label}`}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
          <span>Back</span>
        </button>
        <div className="page-heading">
          <h1 id={headingId} ref={titleRef} tabIndex={-1}>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </header>
      <main className="page-content">{content}</main>
    </section>,
    document.body,
  );
}
