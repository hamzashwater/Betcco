"use client";

import { api } from "@/lib/api";
import { getTrackVisual } from "@/lib/course-visuals";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { useLocale } from "next-intl";

type Track = { id: string; slug: string; name: string; isBtecFocused: boolean };

export function TrackCards() {
  const locale = useLocale();
  const result = useQuery({
    queryKey: ["taxonomy", locale],
    queryFn: () => api<{ tracks: Track[] }>(`/taxonomy?locale=${locale}`),
  });
  if (result.isPending)
    return (
      <div className="grid gap-4 md:grid-cols-2" aria-busy>
        {[0, 1].map((index) => (
          <div
            key={index}
            className="h-32 animate-pulse rounded-2xl bg-slate-200"
          />
        ))}
      </div>
    );
  if (result.isError || !result.data?.tracks.length)
    return (
      <p className="card p-5 text-sm text-muted">
        {locale === "ar"
          ? "ستظهر المسارات المنشورة هنا."
          : "Published learning tracks will appear here."}
      </p>
    );
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {result.data.tracks.map((track) => (
        <Link
          key={track.id}
          href={`/${locale}/tracks/${track.slug}`}
          className="card focus-ring group relative block overflow-hidden p-6 hover:border-primary"
        >
          <Image
            src={getTrackVisual(track.slug, track.isBtecFocused).src}
            alt=""
            fill
            sizes="(max-width: 768px) calc(100vw - 2rem), 50vw"
            className="object-cover opacity-60 transition-transform duration-500 motion-safe:group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(5,10,25,.93),rgba(5,10,25,.42))]" />
          <div className="relative">
            <p className="font-black text-primary">{track.name}</p>
            <p className="mt-2 text-sm text-slate-200">
              {track.isBtecFocused
                ? locale === "ar"
                  ? "مسار BETCCO الأساسي لطلاب BTEC."
                  : "BETCCO's primary BTEC-focused track."
                : locale === "ar"
                  ? "مسار أكاديمي قابل للإدارة."
                  : "An administrator-managed academic track."}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}
