namespace Betcco.Infrastructure.Persistence;

/// <summary>
/// BETCCO Arabic display localization. Pearson's verified academic identity is
/// the English title in PearsonAcademicCatalogueSeed; these are not Pearson translations.
/// </summary>
internal static class PearsonAcademicArabicLocalization
{
    private static readonly IReadOnlyDictionary<string, string> QualificationNames = new Dictionary<string, string>
    {
        ["BTEC-INT-L2-IT"] = "مؤهل بيرسون BTEC الدولي للمستوى الثاني في تكنولوجيا المعلومات",
        ["BTEC-INT-L2-BUS"] = "مؤهل بيرسون BTEC الدولي للمستوى الثاني في الأعمال",
        ["BTEC-INT-L3-IT"] = "مؤهل بيرسون BTEC الدولي للمستوى الثالث في تكنولوجيا المعلومات",
        ["BTEC-INT-L3-BUS"] = "مؤهل بيرسون BTEC الدولي للمستوى الثالث في الأعمال"
    };

    private static readonly IReadOnlyDictionary<string, string> UnitTitles = Parse(
        """
        BTEC-INT-L2-IT|1|استخدام تكنولوجيا المعلومات لدعم المعلومات والاتصال في المؤسسات
        BTEC-INT-L2-IT|2|نمذجة البيانات وجداول البيانات
        BTEC-INT-L2-IT|3|إعداد نظام تقني
        BTEC-INT-L2-IT|4|مقدمة في شبكات الحاسوب
        BTEC-INT-L2-IT|5|مقدمة في البرمجة
        BTEC-INT-L2-IT|6|مقدمة في الرسومات الرقمية والرسوم المتحركة
        BTEC-INT-L2-IT|7|مقدمة في تطوير المواقع الإلكترونية
        BTEC-INT-L2-IT|8|مقدمة في تطوير التطبيقات
        BTEC-INT-L2-IT|9|مقدمة في تصميم الألعاب
        BTEC-INT-L2-IT|10|مقدمة في أنظمة قواعد البيانات
        BTEC-INT-L2-BUS|1|أغراض الأعمال
        BTEC-INT-L2-BUS|2|مؤسسات الأعمال
        BTEC-INT-L2-BUS|3|التنبؤ المالي للأعمال
        BTEC-INT-L2-BUS|4|الخطة التسويقية
        BTEC-INT-L2-BUS|5|الأفراد في المؤسسات
        BTEC-INT-L2-BUS|6|استخدام المعدات المكتبية لدعم الأعمال
        BTEC-INT-L2-BUS|7|الاتصال في سياقات الأعمال
        BTEC-INT-L2-BUS|8|التدريب والتوظيف في الأعمال
        BTEC-INT-L2-BUS|9|البيع الشخصي في الأعمال
        BTEC-INT-L2-BUS|10|علاقات العملاء في الأعمال
        BTEC-INT-L2-BUS|11|الأعمال عبر الإنترنت
        BTEC-INT-L2-BUS|12|حقوق المستهلك
        BTEC-INT-L2-BUS|13|أخلاقيات الأعمال
        BTEC-INT-L2-BUS|14|مسك الدفاتر للأعمال
        BTEC-INT-L2-BUS|15|تأسيس مشروع صغير
        BTEC-INT-L2-BUS|16|العمل ضمن فرق
        BTEC-INT-L2-BUS|17|إدارة الشؤون المالية الشخصية
        BTEC-INT-L2-BUS|18|الترويج وبناء العلامة التجارية في تجارة التجزئة
        BTEC-INT-L2-BUS|19|تقنيات العرض البصري للمنتجات في تجارة التجزئة
        BTEC-INT-L2-BUS|20|أساليب التنظيم الرشيق في الأعمال
        BTEC-INT-L2-BUS|21|أدوات وتقنيات تحسين الأعمال
        BTEC-INT-L2-BUS|22|ريادة الأعمال في مكان العمل
        BTEC-INT-L2-BUS|23|التوريد والشراء في سلسلة الإمداد
        BTEC-INT-L2-BUS|24|التكنولوجيا في قطاع الخدمات اللوجستية
        BTEC-INT-L2-BUS|25|مهارات التخزين في الخدمات اللوجستية
        BTEC-INT-L2-BUS|26|نقل البضائع وتوزيعها وتخزينها في قطاع الخدمات اللوجستية
        BTEC-INT-L2-BUS|27|العمل في مركز اتصال
        BTEC-INT-L2-BUS|28|إدارة مشروع صغير
        BTEC-INT-L2-BUS|29|أهمية ريادة الأعمال والمبادرة
        BTEC-INT-L2-BUS|30|المشروعات الاجتماعية
        BTEC-INT-L3-IT|1|أنظمة تكنولوجيا المعلومات: الاستراتيجية والإدارة والبنية التحتية
        BTEC-INT-L3-IT|2|إنشاء أنظمة لإدارة المعلومات
        BTEC-INT-L3-IT|3|استخدام وسائل التواصل الاجتماعي في الأعمال
        BTEC-INT-L3-IT|4|البرمجة
        BTEC-INT-L3-IT|5|نمذجة البيانات
        BTEC-INT-L3-IT|6|تطوير المواقع الإلكترونية
        BTEC-INT-L3-IT|7|تطوير تطبيقات الأجهزة المحمولة
        BTEC-INT-L3-IT|8|تطوير ألعاب الحاسوب
        BTEC-INT-L3-IT|9|إدارة مشاريع تكنولوجيا المعلومات
        BTEC-INT-L3-IT|10|البيانات الضخمة وتحليلات الأعمال
        BTEC-INT-L3-IT|11|الأمن السيبراني وإدارة الحوادث
        BTEC-INT-L3-IT|12|الدعم الفني لتكنولوجيا المعلومات وإدارته
        BTEC-INT-L3-IT|13|اختبار البرمجيات
        BTEC-INT-L3-IT|14|تخصيص التطبيقات ودمجها
        BTEC-INT-L3-IT|15|التخزين السحابي وأدوات التعاون
        BTEC-INT-L3-IT|16|الرسومات الرقمية ثنائية وثلاثية الأبعاد
        BTEC-INT-L3-IT|17|الرسوم المتحركة والمؤثرات الرقمية
        BTEC-INT-L3-IT|18|إنترنت الأشياء
        BTEC-INT-L3-IT|19|ريادة الأعمال في تكنولوجيا المعلومات
        BTEC-INT-L3-IT|20|أدوات نمذجة عمليات الأعمال
        BTEC-INT-L3-IT|21|مقدمة في الذكاء الاصطناعي
        BTEC-INT-L3-IT|22|مقدمة في الروبوتات والأتمتة
        BTEC-INT-L3-IT|23|الاتجاهات والتقنيات الناشئة
        BTEC-INT-L3-IT|24|الأساسيات التقنية لمتخصصي الحوسبة
        BTEC-INT-L3-IT|25|تطوير التطبيقات من الواجهة إلى الخادم
        BTEC-INT-L3-BUS|1|استكشاف الأعمال
        BTEC-INT-L3-BUS|2|البحث والتخطيط لحملة تسويقية
        BTEC-INT-L3-BUS|3|تمويل الأعمال
        BTEC-INT-L3-BUS|4|إدارة فعالية
        BTEC-INT-L3-BUS|5|الأعمال الدولية
        BTEC-INT-L3-BUS|6|مبادئ الإدارة
        BTEC-INT-L3-BUS|7|اتخاذ القرارات في الأعمال
        BTEC-INT-L3-BUS|8|الموارد البشرية
        BTEC-INT-L3-BUS|9|بناء فرق العمل في الأعمال
        BTEC-INT-L3-BUS|10|تسجيل المعاملات المالية
        BTEC-INT-L3-BUS|11|القوائم المالية للشركات المساهمة العامة
        BTEC-INT-L3-BUS|12|القوائم المالية لأنواع محددة من المنشآت
        BTEC-INT-L3-BUS|13|محاسبة التكاليف والمحاسبة الإدارية
        BTEC-INT-L3-BUS|14|دراسة خدمة العملاء
        BTEC-INT-L3-BUS|15|دراسة أعمال البيع بالتجزئة
        BTEC-INT-L3-BUS|16|عرض المنتجات بصريًا
        BTEC-INT-L3-BUS|17|التسويق الرقمي
        BTEC-INT-L3-BUS|18|الترويج الإبداعي
        BTEC-INT-L3-BUS|19|عرض فكرة مشروع جديد
        BTEC-INT-L3-BUS|20|أخلاقيات الأعمال
        BTEC-INT-L3-BUS|21|التدريب والتطوير
        BTEC-INT-L3-BUS|22|بحوث السوق
        BTEC-INT-L3-BUS|23|الخبرة العملية في الأعمال
        BTEC-INT-L3-BUS|24|بناء العلامة التجارية
        BTEC-INT-L3-BUS|25|تسويق العلاقات
        BTEC-INT-L3-BUS|26|عمليات المشتريات في الأعمال
        BTEC-INT-L3-BUS|27|الخدمات اللوجستية الدولية
        BTEC-INT-L3-BUS|28|أساليب وعمليات البيع
        BTEC-INT-L3-BUS|29|الصحة والسلامة في مكان العمل
        BTEC-INT-L3-BUS|30|التخطيط المهني
        BTEC-INT-L3-BUS|31|إدارة المشاريع بفعالية
        BTEC-INT-L3-BUS|32|استدامة الأعمال والبيئة
        BTEC-INT-L3-BUS|40|النظام القانوني في إنجلترا
        BTEC-INT-L3-BUS|41|قانون العمل في المملكة المتحدة
        BTEC-INT-L3-BUS|42|جوانب المسؤولية المدنية في المملكة المتحدة المؤثرة في الأعمال
        BTEC-INT-L3-BUS|43|جوانب القانون الجنائي في المملكة المتحدة المؤثرة في الأعمال والأفراد
        """);

    internal static string QualificationName(string code) => QualificationNames[code];

    internal static string UnitTitle(string qualificationCode, string unitCode) =>
        UnitTitles[$"{qualificationCode}|{unitCode}"];

    private static IReadOnlyDictionary<string, string> Parse(string source)
    {
        var titles = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var line in source.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var parts = line.Split('|', 3);
            if (parts.Length != 3 || string.IsNullOrWhiteSpace(parts[2]) || !titles.TryAdd($"{parts[0]}|{parts[1]}", parts[2]))
                throw new InvalidOperationException("Invalid BETCCO Arabic academic localization");
        }
        return titles;
    }
}
