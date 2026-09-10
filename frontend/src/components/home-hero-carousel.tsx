"use client";

import { motionIsReduced } from "@/lib/gsap";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

type Slide = {
  key: "apply" | "collaborate" | "plan" | "build";
  src: string;
  mobileSrc?: string;
};

const slides: readonly Slide[] = [
  {
    key: "apply",
    src: "/images/betcco/pack/hero/betcco-hero-desktop.webp",
    mobileSrc: "/images/betcco/pack/hero/betcco-hero-mobile.webp",
  },
  {
    key: "collaborate",
    src: "/images/betcco/pack/platform/online-courses.webp",
  },
  {
    key: "plan",
    src: "/images/betcco/pack/platform/btec-projects.webp",
  },
  {
    key: "build",
    src: "/images/betcco/pack/platform/assessment-feedback.webp",
  },
];

export function HomeHeroCarousel() {
  const t = useTranslations("heroCarousel");
  const [active, setActive] = useState(0);
  const [manuallyPaused, setManuallyPaused] = useState(false);
  const [hoverPaused, setHoverPaused] = useState(false);
  const reduceMotion = motionIsReduced();
  const isPaused = manuallyPaused || hoverPaused || reduceMotion;

  useEffect(() => {
    if (isPaused) return;
    const timer = window.setInterval(
      () => setActive((current) => (current + 1) % slides.length),
      6500,
    );
    return () => window.clearInterval(timer);
  }, [isPaused]);

  const previous = () =>
    setActive((current) => (current - 1 + slides.length) % slides.length);
  const next = () => setActive((current) => (current + 1) % slides.length);
  const slide = slides[active];

  return (
    <section
      className="glass-panel relative aspect-[16/10] overflow-hidden rounded-3xl"
      aria-roledescription="carousel"
      aria-label={t("label")}
      aria-live="off"
      onMouseEnter={() => setHoverPaused(true)}
      onMouseLeave={() => setHoverPaused(false)}
    >
      {slides.map((item, index) => (
        <div
          key={item.key}
          className={`absolute inset-0 transition-opacity duration-700 motion-reduce:transition-none ${index === active ? "opacity-100" : "pointer-events-none opacity-0"}`}
        >
          {item.mobileSrc && (
            <Image
              src={item.mobileSrc}
              alt=""
              fill
              priority={index === 0}
              sizes="(max-width: 640px) calc(100vw - 2rem), 0px"
              className="object-cover sm:hidden"
            />
          )}
          <Image
            src={item.src}
            alt={t(`${item.key}.alt`)}
            fill
            priority={index === 0}
            sizes="(max-width: 1024px) calc(100vw - 2rem), 40vw"
            className={`object-cover ${item.mobileSrc ? "hidden sm:block" : ""}`}
          />
        </div>
      ))}
      <div className="absolute inset-0 bg-[linear-gradient(155deg,rgba(5,10,25,.1),rgba(5,10,25,.93)_86%)]" />
      <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-primary">
          {t(`${slide.key}.eyebrow`)}
        </p>
        <h2 className="mt-1 text-xl font-black text-white sm:text-2xl">
          {t(`${slide.key}.title`)}
        </h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-slate-200">
          {t(`${slide.key}.description`)}
        </p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex gap-1.5" aria-label={t("chooseSlide")}>
            {slides.map((item, index) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setActive(index)}
                className={`focus-ring h-2.5 rounded-full transition-all ${index === active ? "w-7 bg-primary" : "w-2.5 bg-white/45 hover:bg-white/70"}`}
                aria-label={t("showSlide", { number: index + 1 })}
                aria-current={index === active ? "true" : undefined}
              />
            ))}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={previous}
              className="focus-ring grid size-9 place-items-center rounded-lg border border-white/20 bg-slate-950/45 text-white hover:bg-slate-950/70"
              aria-label={t("previous")}
            >
              <ChevronRight size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={next}
              className="focus-ring grid size-9 place-items-center rounded-lg border border-white/20 bg-slate-950/45 text-white hover:bg-slate-950/70"
              aria-label={t("next")}
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setManuallyPaused((value) => !value)}
              className="focus-ring ms-1 grid size-9 place-items-center rounded-lg border border-white/20 bg-slate-950/45 text-white hover:bg-slate-950/70"
              aria-label={manuallyPaused ? t("play") : t("pause")}
              aria-pressed={manuallyPaused}
            >
              {manuallyPaused ? (
                <Play size={16} aria-hidden="true" />
              ) : (
                <Pause size={16} aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
