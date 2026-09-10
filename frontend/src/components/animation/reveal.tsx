"use client";

import { getGsap, motionIsReduced } from "@/lib/gsap";
import { useGSAP } from "@gsap/react";
import { type ComponentPropsWithoutRef, useRef } from "react";

export function Reveal({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      if (motionIsReduced() || !root.current) return;
      const gsap = getGsap();
      gsap.from(root.current, {
        opacity: 0,
        y: 24,
        duration: 0.55,
        ease: "power2.out",
        scrollTrigger: { trigger: root.current, start: "top 88%", once: true },
      });
    },
    { scope: root },
  );
  return (
    <div ref={root} className={className}>
      {children}
    </div>
  );
}

export function StaggerReveal({
  children,
  className = "",
  ...props
}: ComponentPropsWithoutRef<"div">) {
  const root = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      if (motionIsReduced() || !root.current) return;
      const gsap = getGsap();
      gsap.from(root.current.children, {
        opacity: 0,
        y: 20,
        duration: 0.48,
        stagger: 0.06,
        ease: "power2.out",
        scrollTrigger: { trigger: root.current, start: "top 88%", once: true },
      });
    },
    { scope: root },
  );
  return (
    <div ref={root} className={className} {...props}>
      {children}
    </div>
  );
}
