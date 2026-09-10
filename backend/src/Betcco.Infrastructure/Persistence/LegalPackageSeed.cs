using Betcco.Domain.Platform;

namespace Betcco.Infrastructure.Persistence;

internal static class LegalPackageSeed
{
    private static readonly DateTimeOffset EffectiveAtUtc = new(2026, 8, 25, 0, 0, 0, TimeSpan.Zero);

    public static IReadOnlyCollection<LegalDocument> Documents { get; } =
    [
        Document("terms", "الشروط والأحكام", "Terms and conditions", """
            ## 1. مقدمة
            مرحبًا بك في {{BrandName}}. تنظم هذه الشروط استخدام الموقع والتطبيقات والخدمات التعليمية والدورات والاختبارات والملفات والمحتوى والخدمات الرقمية التي تقدمها المنصة.

            باستخدام المنصة أو إنشاء حساب أو شراء دورة أو اشتراك، يقر المستخدم بأنه قرأ هذه الشروط وسياسة الخصوصية والسياسات المرتبطة بها ووافق عليها. لا يؤدي أي بند إلى إسقاط حق إلزامي للمستخدم بموجب التشريعات الأردنية النافذة.

            ## 2. طبيعة المنصة واستقلالها
            {{BrandName}} منصة تعليمية رقمية تقدم مواد ودورات وتمارين ووسائل مساعدة للطلاب، بما في ذلك مواد مرتبطة بتخصصات ومساقات BTEC.

            ما لم يعلن {{BrandName}} رسميًا عن اعتماد موثق، فالمنصة مستقلة ولا تمثل Pearson وليست Pearson BTEC Approved Centre ولا تمنح شهادات Pearson الرسمية. أي شهادة تصدرها المنصة هي شهادة إكمال أو مشاركة خاصة بها ما لم ينص سند رسمي على خلاف ذلك.

            ## 3. الأدوار والصلاحيات
            - الطالب: يصل إلى المحتوى المصرح به، ويتابع الدروس ويقدم الواجبات والاختبارات.
            - المعلم: يقدم ويدير المحتوى المكلف به ضمن الصلاحيات الممنوحة له.
            - الإدارة: تدير المنصة والمستخدمين والدورات والمدفوعات والشكاوى وفق الإجراءات الداخلية.

            لا تمنح صلاحية الإدارة وصولًا بلا سبب وظيفي مشروع، وتسجل العمليات الحساسة في سجل تدقيق.

            ## 4. الحسابات والقاصرون
            يلتزم المستخدم بتقديم معلومات صحيحة وحديثة، ولا يجوز إنشاء حساب باسم شخص آخر أو بيع الحساب أو تأجيره أو مشاركته. يجب حماية كلمة المرور ووسائل المصادقة وإبلاغنا فورًا عن أي استخدام غير مصرح به.

            تطبق سياسة حماية القاصرين وإجراءات موافقة ولي الأمر أو الوصي عند الاقتضاء قانونًا. لا يجوز التحايل على متطلبات العمر أو تقديم تاريخ ميلاد غير صحيح.

            ## 5. استخدام المحتوى والاستخدام المحظور
            يمنح الطالب ترخيصًا شخصيًا ومحدودًا وغير قابل للتحويل للوصول إلى المحتوى المشترك به خلال مدة الوصول. لا تنتقل ملكية الفيديو أو الملف أو الاختبار أو التصميم أو البرنامج أو المادة التعليمية نتيجة الشراء.

            يحظر مشاركة الحساب، ونسخ أو تصوير أو تسجيل أو إعادة نشر أو بيع المحتوى، وإزالة الحماية التقنية، واستخدام Bots أو Scrapers، ومحاولة تجاوز الصلاحيات أو الوصول إلى بيانات الغير، واستغلال الثغرات أو أي هجوم تقني ضار، ورفع ملفات خبيثة، وانتحال الهوية، والتحرش أو التشهير، والغش الأكاديمي أو تقديم أعمال الغير، واستخدام AI خلاف تعليمات المهمة.

            ## 6. الدفع والاسترداد
            يعرض السعر النهائي والخصومات والعملة ومدة الوصول قبل الدفع. لا تعتبر العملية ناجحة إلا بعد تأكيد موثوق من مزود الدفع أو تحقق خادمي موثوق. لا يحتفظ {{BrandName}} برقم البطاقة الكامل أو CVV عند استخدام مزود دفع خارجي.

            تنطبق سياسة الدفع والاسترداد والإلغاء بالإضافة إلى الحقوق المقررة للمستهلك.

            ## 7. تعليق الحساب وتوفر الخدمة
            يجوز تعليق الحساب أو إنهاؤه عند خرق جوهري للشروط أو الاحتيال أو مشاركة الحساب أو انتهاك الملكية الفكرية أو التهديد الأمني أو الإساءة الخطيرة. وحيثما كان مناسبًا نتبع تدرجًا من التحذير إلى التقييد ثم الإنهاء، مع حق الاعتراض عبر الشكاوى.

            نسعى لاستمرار الخدمة، إلا أن الصيانة والتحديثات والأحداث التقنية قد تسبب توقفًا مؤقتًا. لا يمس ذلك حقوق المستهلك عند وجود خلل جوهري أو خدمة معيبة.

            ## 8. النتائج والمسؤولية والقانون المختص
            المحتوى دعم تعليمي ولا يضمن علامة أو نجاحًا أو شهادة أو قبولًا جامعيًا أو وظيفة. تكون مسؤولية {{BrandName}} ضمن الحدود المسموح بها قانونًا ولا يفسر أي بند لإعفاء غير جائز.

            يجوز تحديث الشروط عند تغير الخدمة أو التشريع أو الأمن، ويظهر رقم الإصدار والتاريخ؛ وتطلب موافقة جديدة عند التعديل الجوهري إذا لزم. تخضع الشروط للتشريعات النافذة في المملكة الأردنية الهاشمية، مع محاولة حل النزاع داخليًا أولًا دون تقييد حق اللجوء للجهات الرسمية أو المحاكم المختصة.
            """, """
            ## 1. Introduction
            Welcome to {{BrandName}}. These terms govern the educational services, courses, assessments, files, content, and digital services provided through the platform.

            By using the platform, creating an account, or making a purchase, the user accepts the current terms, privacy policy, and related policies. Nothing in these terms waives a mandatory right under applicable Jordanian law.

            ## 2. Platform status
            {{BrandName}} is an independent educational platform. References to BTEC describe a learning pathway only. Unless a documented official accreditation is announced, the platform does not represent Pearson, is not a Pearson BTEC Approved Centre, and does not issue official Pearson certificates.

            ## 3. Accounts, content, and prohibited conduct
            Accounts are personal and must contain accurate information. Users must protect their credentials. Learners receive a limited, personal, non-transferable access licence; ownership of course materials does not transfer.

            Account sharing, copying or redistributing content, bypassing controls, scraping, unauthorized access, malicious uploads, harassment, impersonation, academic dishonesty, and use of AI contrary to assessment instructions are prohibited.

            ## 4. Payments, service, and disputes
            Final price, discounts, currency, and access period are displayed before payment. A payment succeeds only after trusted provider or server verification. The refund policy applies in addition to mandatory consumer rights.

            Accounts may be restricted for serious breaches, fraud, security threats, or repeated IP violations. The platform may perform maintenance and does not guarantee educational results. These terms are governed by applicable Jordanian law; internal complaints do not limit recourse to competent authorities or courts.
            """),
        Document("privacy", "سياسة الخصوصية", "Privacy policy", """
            ## 1. المسؤول عن البيانات
            مسؤول معالجة البيانات هو {{LegalOwnerName}}، مالك {{BrandName}}، في {{LegalAddress}}. للتواصل بشأن الخصوصية: {{PrivacyEmail}}.

            ## 2. البيانات التي قد نجمعها
            بحسب الخدمة المستخدمة، قد نجمع الاسم والبريد والهاتف عند الحاجة، العمر أو تاريخ الميلاد للتحقق من الأهلية، معلومات المدرسة أو المستوى أو التخصص، بيانات الحساب والصلاحيات، الدورات والتقدم ونتائج الاختبارات والواجبات، الملفات المرفوعة، مراسلات الدعم، بيانات المعاملة، وعنوان IP وبيانات الأمان وتسجيل الدخول والجهاز والمتصفح وتفضيلات ملفات الارتباط وبيانات ولي الأمر عند الحاجة.

            لا نسعى لجمع بيانات شخصية حساسة إلا عند الضرورة والمشروعية وتوفير الحماية المطلوبة.

            ## 3. المصادر والأغراض والأساس القانوني
            نحصل على البيانات من المستخدم أو وليه أو استخدامه للخدمة أو مزودي الخدمة المشروعين مثل مزود الدفع. نستخدمها لإنشاء الحساب، والتحقق من الهوية والأهلية، وتقديم الدورات وحفظ التقدم، واستقبال وتقييم المهام، ومعالجة المدفوعات، والدعم، ومنع الاحتيال وإساءة الاستخدام، وحماية الأنظمة، والالتزامات القانونية، وتحسين الخدمة، والتسويق فقط عند السماح وبحسب الموافقات.

            تتم المعالجة بناءً على الموافقة عند الحاجة، أو تنفيذ العلاقة التعاقدية، أو الالتزام القانوني، أو أي أساس آخر يسمح به القانون الأردني النافذ. تطلب الموافقات المنفصلة للأغراض المنفصلة التي تحتاجها.

            ## 4. تقليل البيانات والاحتفاظ
            نجمع الحد الضروري فقط، ولا ينبغي طلب معلومات لا تتصل بالخدمة التعليمية. كسياسة تشغيلية عامة: يحتفظ ببيانات الحساب والسجلات التعليمية حتى 24 شهرًا بعد انتهاء العلاقة عند وجود حاجة مشروعة؛ وطلبات الدعم والشكاوى حتى 24 شهرًا بعد إغلاقها؛ وسجلات الأمن عادة حتى 12 شهرًا؛ والنسخ الاحتياطية وفق دورة حذف لا تتجاوز عادة 90 يومًا بعد الحذف من النظام النشط. تخضع السجلات المالية للمدد القانونية والضريبية والمحاسبية، وقد تتغير المدد عندما يفرض القانون ذلك.

            ## 5. المشاركة والنقل
            قد نشارك الحد اللازم مع الاستضافة والبنية السحابية والبريد والإشعارات والدفع والنسخ الاحتياطي والأمن والتحليلات المصرح بها والجهات الحكومية أو القضائية عند الالتزام القانوني. يلتزم مقدمو الخدمة بالأغراض المسموحة والتدابير المناسبة.

            إذا تطلبت الاستضافة نقلًا خارج الأردن، نقيم ذلك ونعالجه وفق المتطلبات القانونية والأنظمة والتعليمات النافذة.

            ## 6. حقوقك
            بحسب القانون، قد تشمل الحقوق الوصول والحصول على البيانات، وسحب الموافقة، والتصحيح، والتقييد في الحالات المقررة، والمحو أو الإخفاء، والاعتراض، والحصول على نسخة قابلة للنقل، ومعرفة الإخلال المؤثر بالبيانات وفق المتطلبات. تقدم الطلبات إلى {{PrivacyEmail}} أو مركز الخصوصية، وقد نتحقق من الهوية لحماية البيانات.

            ## 7. الأمن والحوادث والتسويق والقاصرون
            نطبق التشفير أثناء النقل والتحكم في الصلاحيات وسجلات التدقيق وحماية الملفات الخاصة والنسخ الاحتياطية وإدارة الثغرات. لا يمكن ضمان أمن إلكتروني مطلق، لكننا نتخذ تدابير مناسبة.

            عند الإخلال بأمن البيانات نقيم الحادث ونتعامل معه وفق القانون، وننفذ متطلبات الإبلاغ عند اللزوم. التسويق مستقل عن قبول الشروط ويمكن إلغاؤه في أي وقت. تطبق سياسة القاصرين على غير المتمتعين بالأهلية القانونية. يمكن تقديم شكوى خصوصية دون انتقام داخلي، ولا يمنع ذلك التواصل مع مديرية حماية البيانات الشخصية أو الجهة المختصة.
            """, """
            ## 1. Controller and scope
            {{LegalOwnerName}} is the controller for {{BrandName}}. Contact {{PrivacyEmail}} for privacy requests. This policy covers account, learning, support, payment, security, device, and preference data processed to operate the service.

            ## 2. Use and legal basis
            We use the minimum necessary data to provide accounts, learning, assessments, support, secure payments, fraud prevention, system security, legal compliance, and service improvement. Marketing is separate and is used only where permitted and consented to. Processing is based on consent where required, contract performance, legal obligations, or another lawful basis under applicable Jordanian law.

            ## 3. Retention, sharing, and rights
            Operational retention is limited to the purpose and applicable legal requirements. We may use appropriately bound hosting, email, payment, backup, security, and consented analytics providers. Cross-border transfers are assessed under applicable requirements.

            Subject to law, users may request access, correction, withdrawal of consent, restriction, deletion or de-identification, objection, portability, and relevant breach information. Requests may be made through the Privacy Centre or {{PrivacyEmail}}; identity verification may be required.

            ## 4. Security and minors
            We use reasonable security measures including encryption in transit, access control, audit logging, private-file protection, backups, and vulnerability management. We assess incidents and handle notifications as required. Marketing is optional. The minors policy applies to users who lack legal capacity.
            """),
        Document("refunds", "سياسة الدفع والاسترداد والإلغاء", "Payment, refund, and cancellation policy", """
            ## 1. شفافية الأسعار وإثبات الشراء
            يظهر قبل الدفع اسم الدورة أو الباقة والسعر الأساسي وأي خصم والمبلغ النهائي والعملة ومدة الوصول وطبيعة الاشتراك. بعد الدفع الناجح يحصل المستخدم على إثبات إلكتروني يتضمن البيانات الأساسية للمعاملة.

            ## 2. نجاح الدفع
            لا تمنح حالة Paid بناءً على إشارة من واجهة المستخدم أو صفحة نجاح. تعتمد على تأكيد مزود الدفع أو تحقق موثوق من الخادم.

            ## 3. الاسترداد التجاري
            إضافة إلى الحقوق التي يقررها القانون، يمكن طلب استرداد خلال 7 أيام تقويمية من الشراء إذا لم يستهلك الطالب أكثر من 20% من المحتوى الأساسي للدورة. لا تسري القيود إذا كان للمستخدم حق أقوى بموجب القانون.

            ## 4. الاستثناءات والمعالجة
            إذا كانت الخدمة معيبة أو غير مطابقة بصورة جوهرية لما أعلن عنه، نعالج الطلب وفق الحقوق القانونية بما يشمل التصحيح أو الاسترداد أو التعويض حيث ينطبق. تعاد الدفعة المكررة المثبتة. يتم الاسترداد كلما أمكن إلى وسيلة الدفع الأصلية، وقد تختلف المدة بحسب المزود أو البنك.

            ## 5. التجديد وإساءة الاستخدام
            عند تقديم اشتراك متجدد تلقائيًا، نبين ذلك بوضوح قبل الاشتراك ونوفر إيقاف التجديد المستقبلي. لا يمنع التحقيق في الاحتيال أو نسخ المحتوى من مطالبة مشروعة بحق مقرر للمستهلك.
            """, """
            ## Payment and refunds
            Course name, base price, discounts, final amount, currency, access duration, and renewal status are shown before payment. Payment is successful only after trusted provider or server verification; a success page alone is never sufficient.

            In addition to statutory consumer rights, {{BrandName}} offers a commercial refund request window of 7 calendar days where no more than 20% of a course's core content has been consumed. Materially defective services and proven duplicate charges are handled according to applicable rights. Refunds are normally returned to the original payment method. Auto-renewal, if offered, is disclosed before purchase and can be stopped for future periods.
            """),
        Document("copyright", "سياسة حقوق النشر والملكية الفكرية", "Copyright and intellectual property policy", """
            ## 1. المحتوى والترخيص
            تعود حقوق المواد التي أنشأتها {{BrandName}} إلى مالكها أو إلى صاحب الحق المرخص لها باستخدامها. يشمل ذلك الفيديو والصوت والنصوص والتصميم والبرمجيات والاختبارات والرسومات والملفات. يحصل الطالب على ترخيص محدود وشخصي للتعلم فقط، ولا يجوز إعادة النشر أو البيع أو التوزيع أو العرض التجاري أو إنشاء نسخ غير مصرح بها.

            ## 2. محتوى المعلم
            لا تصبح مواد المعلم ملكًا للمنصة تلقائيًا. تحدد اتفاقية المعلم حقوق الاستغلال المرخصة ومدتها ونطاقها، وأي نقل كامل لحقوق الاستغلال المالي يحتاج اتفاقًا مكتوبًا محددًا مستقلًا.

            ## 3. البلاغات
            يقدم صاحب الحق بلاغًا إلى {{CopyrightEmail}} متضمنًا تعريف العمل المحمي والمحتوى المدعى مخالفته ورابطه وبيانات الاتصال وإقرار صحة المعلومات. يجوز تعطيل المحتوى مؤقتًا أثناء التحقيق، وقد يعلق المستخدم ذو المخالفات المتكررة أو المتعمدة.
            """, """
            ## Copyright and IP
            Platform-created materials belong to their owners or licensors. Learners receive only a limited personal learning licence. Teacher content remains subject to the written teacher agreement; ownership does not transfer automatically.

            Send a copyright notice to {{CopyrightEmail}} with the protected work, allegedly infringing content and URL, contact details, and a good-faith accuracy statement. Content may be temporarily disabled during review, and repeated intentional infringement may result in account action.
            """),
        Document("student-agreement", "اتفاقية الطالب", "Student agreement", """
            ## 1. الالتزام والحساب
            يلتزم الطالب باستخدام {{BrandName}} للتعلم بصورة مشروعة وأخلاقية. الحساب شخصي ولا يجوز مشاركة بيانات الدخول أو منح الآخرين وصولًا مدفوعًا من خلاله.

            ## 2. النزاهة الأكاديمية والذكاء الاصطناعي
            يجب أن تكون الواجبات من عمل الطالب ما لم يسمح بالتعاون أو استخدام مصادر أخرى، مع الإشارة للمصادر عند الاقتضاء. يحظر الانتحال والغش وتقديم أعمال شخص آخر. يجوز استخدام AI في الحدود التي يسمح بها المعلم أو تعليمات المهمة، ولا يجوز تقديم ناتجه كعمل أصلي كامل حيث تمنع المهمة ذلك.

            ## 3. السلوك والملفات والتقييم
            يحظر الإساءة أو نشر معلومات الآخرين دون إذن. يتحمل الطالب مسؤولية حقه في رفع الملفات ولا يجوز رفع برمجيات ضارة أو محتوى غير مشروع. تقييمات المنصة تدريبية أو داخلية ما لم يعلن خلاف ذلك رسميًا، وليست بالضرورة نتيجة من Pearson أو المدرسة أو الجهة المانحة. يحق للطالب تقديم اعتراض أو شكوى عبر القنوات المخصصة.
            """, """
            ## Student agreement
            Students must use {{BrandName}} lawfully and ethically. Accounts are personal. Submitted work must be the student's own unless collaboration or other sources are expressly allowed; plagiarism and impersonation are prohibited.

            AI may be used only within teacher or assignment instructions. Users must have the right to upload their files and must not submit malicious or unlawful content. Platform assessments are educational or internal unless an official status is expressly documented. Students may use the complaints process for concerns or appeals.
            """),
        Document("teacher-agreement", "اتفاقية المعلم", "Teacher agreement", """
            ## 1. الصفة والمسؤوليات
            لا يصبح المستخدم معلمًا بمجرد التسجيل؛ ينشأ أو يفعّل حسابه من الإدارة. يلتزم المعلم بتقديم محتوى مناسب، وعدم تضليل الآخرين بمؤهلاته، واحترام الطلاب، والمحافظة على سرية بياناتهم، وعدم تنزيلها للاستخدام الشخصي أو استخدامها في تسويق شخصي أو طلب بيانات غير لازمة.

            ## 2. الملكية الفكرية
            يقر المعلم بأن محتواه من إنشائه أو أن لديه التراخيص اللازمة. تبقى الحقوق الأصلية للمعلم ما لم توجد اتفاقية خطية مستقلة. يمنح {{BrandName}} ترخيصًا غير حصري لاستضافة المحتوى وتخزينه ونسخه تقنيًا وبثه وعرضه للمستخدمين المصرح لهم وتكييفه تقنيًا لتشغيل المنصة؛ نطاقه عالمي بسبب الإنترنت وغرضه تقديم الدورة والترويج المشروع لها، ويستمر أثناء الاتفاق ولمدة لا تتجاوز 6 أشهر بعده لاستمرار وصول الطلاب السابقين ما لم يتفق كتابة على خلاف ذلك.

            ## 3. المقابل والتواصل والمغادرة
            تحدد نسبة المعلم ودورة التسوية والحد الأدنى للتحويل في ملحق تجاري مستقل. لا تحل هذه الاتفاقية محل عقد عمل إذا تطلبته العلاقة الفعلية. يستخدم التواصل الرسمي مع الطلاب قدر الإمكان، وتطبق قواعد أشد مع القاصرين. لا يسجل أو ينشر ما يتضمن طلابًا دون الإشعار والموافقات المطلوبة. عند المغادرة توقف الصلاحيات غير اللازمة فورًا وتبقى السرية والحقوق القائمة سارية بطبيعتها.
            """, """
            ## Teacher agreement
            Teacher status is created or activated by {{BrandName}} administration, not by self-registration. Teachers must provide suitable content, be accurate about qualifications, respect learners, keep learner data confidential, and avoid personal marketing or unnecessary data collection.

            Teachers retain original rights unless a separate written agreement says otherwise. They grant a non-exclusive worldwide operational licence to host, technically copy, stream, display, and adapt content to deliver and lawfully promote a course during the agreement and, normally, for up to six months afterwards to preserve earlier learner access. Commercial split and settlement terms are governed by a separate commercial addendum. Official channels must be used with learners, with enhanced safeguards for minors.
            """),
        Document("minors", "سياسة حماية القاصرين", "Minors protection policy", """
            ## 1. المبدأ والموافقة
            يولي {{BrandName}} أهمية خاصة لخصوصية وسلامة المستخدمين دون سن الرشد. سن الرشد لأغراض هذه السياسة هو 18 سنة شمسية كاملة، مع مراعاة أحكام الأهلية النافذة. عندما يطلب القانون موافقة مسبقة، لا نفعل المعالجة أو الحساب الكامل قبل الحصول عليها من الوالد أو الولي أو الجهة المخولة قانونًا.

            ## 2. التسجيل والتواصل
            التسجيل الذاتي الحالي مخصص لمن بلغ 18 سنة أو أكثر. قبل تفعيل التسجيل للقاصرين في بيئة الإنتاج، يجب تفعيل مسار موافقة ولي الأمر أو الوصي والتحقق منه. لا تجمع المنصة بيانات ولي الأمر في الإصدار الحالي، ولذلك لا يجوز استخدام تاريخ الميلاد لإثبات موافقة ولي الأمر. يتم التواصل التعليمي عبر القنوات الرسمية القابلة للإشراف والتدقيق. يمنع طلب صور خاصة أو وثائق أو معلومات شخصية لا تتطلبها العملية التعليمية.

            ## 3. التسويق والسلامة
            لا تستخدم بيانات القاصر للاستهداف الإعلاني السلوكي. لا تطلب الكاميرا أو الميكروفون إلا لحاجة تعليمية واضحة ومع الإشعارات والموافقات المطلوبة. للولي ممارسة الحقوق التي يجيزها القانون. تعطى بلاغات التحرش والتهديد والابتزاز وطلب المعلومات غير المناسب والتواصل غير الملائم أو المحتوى المهدد للسلامة أولوية للمراجعة عبر {{ComplaintsEmail}}.
            """, """
            ## Minors protection
            {{BrandName}} gives special attention to the privacy and safety of users under the age of legal majority. Self-registration is currently limited to learners aged 18 and over. Before enabling registration for minors in production, a verified parent or guardian-consent workflow must be enabled. The current release does not collect guardian data, and a date of birth must not be treated as evidence of guardian consent.

            Learning communication must use supervised, auditable official channels. Teachers must not request private images, documents, or unnecessary personal information. Minor data is not used for behavioural advertising. Safety reports receive priority review at {{ComplaintsEmail}}.
            """),
        Document("cookies", "سياسة ملفات تعريف الارتباط", "Cookie policy", """
            ## 1. الفئات
            ملفات الارتباط أو المعرفات الصغيرة تساعد على تشغيل الموقع وحفظ التفضيلات. الفئات هي: الضرورية لتسجيل الدخول والحماية والجلسة؛ التفضيلات مثل اللغة وإعدادات الواجهة؛ التحليلات لتحسين الأداء؛ والتسويق لقياس الحملات أو الإعلانات.

            ## 2. الموافقة والتحكم
            يمكن تشغيل الضرورية دون موافقة على غير الضرورية. لا تشغل التحليلات أو التسويق التي تتطلب موافقة قبل الحصول عليها، ولا تكون الفئات غير الضرورية مقبولة مسبقًا. توفر المنصة خيارات قبول الكل ورفض غير الضرورية والتخصيص، ويمكن تغيير الاختيار لاحقًا من إعدادات ملفات الارتباط.

            ## 3. الجهات الخارجية
            إذا استخدمت المنصة خدمة طرف ثالث تضع ملفات ارتباط أو أدوات تتبع، نبين الجهة أو فئتها والغرض. في الإصدار الحالي لا تشغّل {{BrandName}} تحليلات أو تسويقًا غير ضروري افتراضيًا.
            """, """
            ## Cookie policy
            Cookies and similar identifiers may be necessary for authentication, security, sessions, and preferences such as language or display settings. Analytics and marketing technologies that require consent are not enabled before that consent, and they are not pre-selected.

            Users can accept all, reject non-essential technologies, or customise preferences and change their choice later. {{BrandName}} currently does not enable non-essential analytics or marketing tracking by default.
            """),
        Document("complaints", "سياسة الشكاوى", "Complaints policy", """
            ## 1. تقديم الشكوى
            تهدف السياسة إلى قناة عادلة وواضحة للطلاب والمعلمين والعملاء. يمكن تقديم شكوى عن دفع أو استرداد أو دورة أو معلم أو طالب أو تعليق حساب أو خصوصية أو حقوق نشر أو سلامة أو مشكلة تقنية أو سلوك موظف عبر /complaints أو {{ComplaintsEmail}}.

            ## 2. المعالجة والسرية
            تحصل كل شكوى على رقم مرجعي. نسجلها ونتحقق من البيانات الضرورية ونصنفها ونسندها للمختص وندرس الأدلة ونتخذ الإجراء المناسب ونبلغ صاحبها عند الملاءمة. لا يرى المعلم شكوى لا تتصل بدوراته أو طلابه المصرح لهم، وتقتصر الشكاوى الحساسة على المكلفين بمعالجتها.

            ## 3. عدم الانتقام والجهات الرسمية
            لا يتعرض المستخدم لإجراء سلبي لمجرد شكوى مشروعة بحسن نية. لا تقيد هذه السياسة الحق في التوجه إلى مديرية حماية البيانات الشخصية أو حماية المستهلك أو القضاء أو جهة مختصة بحسب النزاع.
            """, """
            ## Complaints policy
            Complaints about payments, refunds, courses, teachers, students, account action, privacy, copyright, safety, technical issues, or staff conduct can be submitted at /complaints or to {{ComplaintsEmail}}. Each complaint receives a reference, is triaged and assigned, and is handled confidentially by authorised people. Good-faith complaints do not trigger retaliation and do not restrict recourse to competent authorities.
            """),
        Document("privacy-center", "مركز الخصوصية", "Privacy centre", """
            ## تقديم طلب خصوصية
            يمكن تقديم طلب وصول أو تصحيح أو سحب موافقة أو تقييد أو محو أو اعتراض أو قابلية نقل، بحسب ما يقرره القانون، عبر نموذج مركز الخصوصية أو {{PrivacyEmail}}.

            لحماية البيانات قد نطلب تحققًا معقولًا من الهوية قبل تنفيذ الطلب. لا يؤثر سحب الموافقة على مشروعية المعالجة السابقة، وقد نحتفظ ببيانات إذا أوجب القانون ذلك أو وُجد أساس قانوني مستقل.

            المرجع القانوني الأساسي هو قانون حماية البيانات الشخصية الأردني رقم 24 لسنة 2023 والأنظمة والتعليمات النافذة بموجبه. هذه الصفحة معلومات تشغيلية وليست استشارة قانونية.
            """, """
            ## Privacy centre
            Submit requests for access, correction, consent withdrawal, restriction, deletion, objection, or portability, where applicable, through the Privacy Centre or {{PrivacyEmail}}. Reasonable identity verification may be required. Consent withdrawal does not affect prior lawful processing, and some records may be retained where required by law or another legal basis.

            This page is operational information, not legal advice. Review should be completed before production publication.
            """),
        Document("security", "الإبلاغ عن ثغرة أمنية", "Report a security vulnerability", """
            ## الإبلاغ المسؤول
            إذا اكتشفت ثغرة أمنية محتملة في {{BrandName}}، أرسل بلاغًا إلى {{SecurityEmail}} أو استخدم النموذج المخصص. صف الأثر وخطوات إعادة الإنتاج بأقل تفاصيل لازمة، ولا تعرض بيانات المستخدمين أو تستخرجها أو تعدلها أو تعطل الخدمة.

            يمنع استغلال الثغرة أو الوصول غير المصرح به أو اختبار الأنظمة بصورة قد تضر المستخدمين. نراجع البلاغات بحسن نية ونطلب معلومات إضافية عند الحاجة. لا يضمن هذا النص حصانة قانونية؛ اعمل ضمن القانون والتصريح الممنوح.
            """, """
            ## Responsible disclosure
            Report a potential {{BrandName}} security vulnerability to {{SecurityEmail}} or through the dedicated form. Include the impact and minimal reproduction details. Do not access, expose, alter, or extract user data, and do not disrupt service.

            Good-faith reports are reviewed, but this policy does not authorise unlawful access or testing and does not grant legal immunity.
            """)
    ];

    private static LegalDocument Document(string slug, string arabicTitle, string englishTitle, string arabicContent, string englishContent) => new()
    {
        Slug = slug,
        Version = "1.0",
        ArabicTitle = arabicTitle,
        EnglishTitle = englishTitle,
        ArabicContent = arabicContent.Trim(),
        EnglishContent = englishContent.Trim(),
        EffectiveAtUtc = EffectiveAtUtc,
        IsPublished = true,
        IsCurrent = true
    };
}
