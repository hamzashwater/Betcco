"use client";

import { DashboardHeader } from "@/components/dashboard/dashboard-ui";
import { useLocale } from "next-intl";

export function RetakeManagement() {
  const locale = useLocale();

  return (
    <section className="shell py-10">
      <DashboardHeader
        eyebrow="BETCCO REVIEW"
        title={locale === "ar" ? "إعادة التقييم القديمة" : "Legacy Retakes"}
        description={
          locale === "ar"
            ? "لم يعد BETCCO ينشئ طلبات Retake جديدة. خدمة تقييم المهمة تشمل مراجعة أولى، ملاحظات المعلم، ثم فحص نسخة معدلة واحدة ضمن نفس الطلب."
            : "BETCCO no longer creates new Retake requests. Assignment review now includes an initial review, teacher feedback, and one revised-work check in the same request."
        }
      />
      <div className="card mt-6 p-5">
        <p className="text-sm leading-6 text-muted">
          {locale === "ar"
            ? "تظل طلبات Retake التاريخية محفوظة للقراءة والتدقيق، لكن لا يمكن إنشاء Retake جديد من هذه الصفحة أو من واجهة البرمجة."
            : "Historical Retake records remain available for reading and audit, but no new Retake can be created from this page or the API."}
        </p>
      </div>
    </section>
  );
}
