"use client";

import { useEffect, useRef, type RefObject } from "react";

/** Focus ownership for the shell's modal drawer and public search dialog. */
export function useDialogFocus(
  open: boolean,
  container: RefObject<HTMLElement | null>,
  onClose: () => void,
  initialFocus?: RefObject<HTMLElement | null>,
) {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!open || !container.current) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    const root = container.current;
    const background: { element: HTMLElement; inert: boolean }[] = [];
    let branch: HTMLElement = root;
    while (branch.parentElement) {
      for (const sibling of branch.parentElement.children) {
        if (sibling !== branch && sibling instanceof HTMLElement) {
          background.push({
            element: sibling,
            inert: sibling.hasAttribute("inert"),
          });
          sibling.setAttribute("inert", "");
        }
      }
      if (branch.parentElement === document.body) break;
      branch = branch.parentElement;
    }
    const focusable = () =>
      Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex="0"]',
        ),
      ).filter(
        (element) =>
          !element.closest("[hidden]") &&
          getComputedStyle(element).display !== "none",
      );
    document.body.style.overflow = "hidden";
    (initialFocus?.current ?? focusable()[0] ?? root).focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close.current();
      }
      if (event.key !== "Tab") return;
      const elements = focusable();
      const first = elements[0];
      const last = elements.at(-1);
      if (!first) {
        event.preventDefault();
        root.focus();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === root)
      ) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    root.addEventListener("keydown", handleKey);
    return () => {
      root.removeEventListener("keydown", handleKey);
      document.body.style.overflow = overflow;
      for (const { element, inert } of background)
        if (!inert) element.removeAttribute("inert");
      if (previous?.isConnected) previous.focus();
    };
  }, [open, container, initialFocus]);
}
