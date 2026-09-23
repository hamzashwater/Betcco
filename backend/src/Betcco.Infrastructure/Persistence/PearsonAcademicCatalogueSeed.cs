using Betcco.Domain.Evaluations;
using Microsoft.EntityFrameworkCore;

namespace Betcco.Infrastructure.Persistence;

/// <summary>
/// Trusted Pearson identity import. Arabic display text comes from BETCCO localization,
/// not Pearson. Existing English fallback values are localized without changing canonical
/// English identity or overwriting distinct administrator-provided Arabic text.
/// No delivery plan or grade allocation is inferred from these lists.
/// </summary>
public static class PearsonAcademicCatalogueSeed
{
    private sealed record Specification(string Code, string Name, string SpecializationSlug,
        string VersionCode, DateTimeOffset EffectiveFromUtc, string Url, string Units);

    private static readonly Specification[] Specifications =
    [
        new("BTEC-INT-L2-IT", "Pearson BTEC International Level 2 Information Technology", "information-technology",
            "ISSUE-1-DEC-2023", new DateTimeOffset(2023, 12, 1, 0, 0, 0, TimeSpan.Zero),
            "https://qualifications.pearson.com/content/dam/pdf/btec-international-level-2/information-technology/2022/specification-and-sample-assessments/information-technology-specification.pdf",
            """
            1|Using IT to Support Information and Communication in Organisations
            2|Data and Spreadsheet Modelling
            3|Setting up a Technology System
            4|Introduction to Computer Networking
            5|Introduction to Programming
            6|Introduction to Digital Graphics and Animation
            7|Introduction to Website Development
            8|Introduction to App Development
            9|Introduction to Games Design
            10|Introduction to Database Systems
            """),
        new("BTEC-INT-L2-BUS", "Pearson BTEC International Level 2 Business", "business",
            "ISSUE-1-DEC-2023", new DateTimeOffset(2023, 12, 1, 0, 0, 0, TimeSpan.Zero),
            "https://qualifications.pearson.com/content/dam/pdf/btec-international-level-2/business/2022/specification-and-sample-assessments/business-specification.pdf",
            """
            1|Business Purposes
            2|Business Organisations
            3|Financial Forecasting for Business
            4|The Marketing Plan
            5|People in Organisations
            6|Using Office Equipment to Provide Business Support
            7|Communication in Business Contexts
            8|Training and Employment in Business
            9|Personal Selling in Business
            10|Customer Relations in Business
            11|Business Online
            12|Consumer Rights
            13|Business Ethics
            14|Bookkeeping for Business
            15|Starting a Small Business
            16|Working in Teams
            17|Managing Personal Finances
            18|Promoting and Branding in Retail Business
            19|Visual Merchandising and Display Techniques for Retail Business
            20|Lean Organisation Techniques in Business
            21|Business Improvement Tools and Techniques
            22|Enterprise in the Workplace
            23|Sourcing and Buying in the Supply Chain
            24|Technology in the Logistics Sector
            25|Warehousing Skills in Logistics
            26|Transport, Distribution and the Storage of Goods within the Logistics Industry
            27|Working in a Contact Centre
            28|Running a Small Business
            29|The Importance of Enterprise and Entrepreneurship
            30|Social Enterprise
            """),
        new("BTEC-INT-L3-IT", "Pearson BTEC International Level 3 Information Technology", "information-technology",
            "ISSUE-4-MAR-2024", new DateTimeOffset(2024, 3, 1, 0, 0, 0, TimeSpan.Zero),
            "https://qualifications.pearson.com/content/dam/pdf/btec-international-level-3/it/specification-and-sample-assessments/btec-international-level-3-it-specification.pdf",
            """
            1|Information Technology Systems – Strategy, Management and Infrastructure
            2|Creating Systems to Manage Information
            3|Using Social Media in Business
            4|Programming
            5|Data Modelling
            6|Website Development
            7|Mobile Apps Development
            8|Computer Games Development
            9|IT Project Management
            10|Big Data and Business Analytics
            11|Cyber Security and Incident Management
            12|IT Technical Support and Management
            13|Software Testing
            14|Customising and Integrating Applications
            15|Cloud Storage and Collaboration Tools
            16|Digital 2D and 3D Graphics
            17|Digital Animation and Effects
            18|The Internet of Things
            19|Enterprise in IT
            20|Business Process Modelling Tools
            21|Introduction to Artificial Intelligence (AI)
            22|Introduction to Robotics and Automation
            23|Emerging Trends and Technologies
            24|Technical Fundamentals for Computing Professionals
            25|Full Stack Development
            """),
        new("BTEC-INT-L3-BUS", "Pearson BTEC International Level 3 Business", "business",
            "ISSUE-4-AUG-2024", new DateTimeOffset(2024, 8, 1, 0, 0, 0, TimeSpan.Zero),
            "https://qualifications.pearson.com/content/dam/pdf/btec-international-level-3/business/specification-and-sample-assessments/btecint-bus-spec.pdf",
            """
            1|Exploring Business
            2|Research and Plan a Marketing Campaign
            3|Business Finance
            4|Managing an Event
            5|International Business
            6|Principles of Management
            7|Business Decision Making
            8|Human Resources
            9|Team Building in Business
            10|Recording Financial Transactions
            11|Financial Statements for Public Limited Companies
            12|Financial Statements for Specific Businesses
            13|Cost and Management Accounting
            14|Investigating Customer Service
            15|Investigating Retail Business
            16|Visual Merchandising
            17|Digital Marketing
            18|Creative Promotion
            19|Pitching for a New Business
            20|Business Ethics
            21|Training and Development
            22|Market Research
            23|Work Experience in Business
            24|Branding
            25|Relationship Marketing
            26|Procurement Processes in Business
            27|International Logistics
            28|Sales Techniques and Processes
            29|Health and Safety in the Workplace
            30|Career Planning
            31|Effective Project Management
            32|Business and Environmental Sustainability
            40|The English Legal System
            41|UK Employment Law
            42|Aspects of UK Civil Liability Affecting Business
            43|Aspects of UK Criminal Law Impacting on Business and Individuals
            """)
    ];

    public static async Task ApplyAsync(BetccoDbContext db, CancellationToken cancellationToken = default)
    {
        var btecTrackId = await db.LearningTracks.AsNoTracking().Where(x => x.IsBtecFocused && x.Slug == "btec")
            .Select(x => x.Id).SingleOrDefaultAsync(cancellationToken);
        if (btecTrackId == Guid.Empty) return;
        await using var transaction = db.Database.IsRelational()
            ? await db.Database.BeginTransactionAsync(cancellationToken)
            : null;

        foreach (var spec in Specifications)
        {
            var specialization = await db.Specializations.AsNoTracking()
                .SingleOrDefaultAsync(x => x.LearningTrackId == btecTrackId && x.Slug == spec.SpecializationSlug, cancellationToken);
            if (specialization is null) continue;

            var qualification = await db.Qualifications.SingleOrDefaultAsync(x => x.Code == spec.Code, cancellationToken);
            if (qualification is not null && (qualification.Source != AcademicSource.PearsonOfficial
                || qualification.EnglishName != spec.Name || qualification.SpecializationId != specialization.Id))
                throw new InvalidOperationException($"Pearson seed conflict: {spec.Code}");
            var arabicQualificationName = PearsonAcademicArabicLocalization.QualificationName(spec.Code);
            if (qualification is null)
            {
                qualification = new Qualification
                {
                    Code = spec.Code,
                    EnglishName = spec.Name,
                    ArabicName = arabicQualificationName,
                    SpecializationId = specialization.Id,
                    Source = AcademicSource.PearsonOfficial
                };
                db.Qualifications.Add(qualification);
            }
            else if (string.IsNullOrWhiteSpace(qualification.ArabicName) || qualification.ArabicName == spec.Name)
            {
                qualification.ArabicName = arabicQualificationName;
            }

            var version = await db.QualificationVersions.SingleOrDefaultAsync(
                x => x.QualificationId == qualification.Id && x.VersionCode == spec.VersionCode, cancellationToken);
            if (version is not null && (version.Source != AcademicSource.PearsonOfficial || version.SourceReference != spec.Url))
                throw new InvalidOperationException($"Pearson seed conflict: {spec.Code}/{spec.VersionCode}");
            if (version is null)
            {
                version = new QualificationVersion
                {
                    QualificationId = qualification.Id,
                    VersionCode = spec.VersionCode,
                    SourceReference = spec.Url,
                    EffectiveFromUtc = spec.EffectiveFromUtc,
                    Source = AcademicSource.PearsonOfficial
                };
                db.QualificationVersions.Add(version);
            }

            var rows = spec.Units.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Select(line => line.Split('|', 2)).Select(parts => (Code: parts[0], Title: parts[1])).ToArray();
            if (rows.Select(x => x.Code).Distinct(StringComparer.Ordinal).Count() != rows.Length)
                throw new InvalidOperationException($"Duplicate official unit in seed: {spec.Code}");
            var existing = await db.UnitDefinitions.Where(x => x.QualificationVersionId == version.Id)
                .ToDictionaryAsync(x => x.Code, cancellationToken);
            foreach (var (code, title) in rows)
            {
                var arabicTitle = PearsonAcademicArabicLocalization.UnitTitle(spec.Code, code);
                if (string.IsNullOrWhiteSpace(title) || string.IsNullOrWhiteSpace(arabicTitle)
                    || string.Equals(title, arabicTitle, StringComparison.Ordinal))
                    throw new InvalidOperationException($"Incomplete BETCCO academic localization: {spec.Code}/{code}");
                if (existing.TryGetValue(code, out var unit))
                {
                    if (unit.Source != AcademicSource.PearsonOfficial || unit.EnglishTitle != title || unit.SourceReference != spec.Url)
                        throw new InvalidOperationException($"Pearson seed conflict: {spec.Code}/{code}");
                    if (string.IsNullOrWhiteSpace(unit.ArabicTitle) || unit.ArabicTitle == title)
                        unit.ArabicTitle = arabicTitle;
                    continue;
                }
                db.UnitDefinitions.Add(new UnitDefinition
                {
                    QualificationVersionId = version.Id,
                    Code = code,
                    EnglishTitle = title,
                    ArabicTitle = arabicTitle,
                    SourceReference = spec.Url,
                    Source = AcademicSource.PearsonOfficial,
                    IsActive = true,
                    PublishedAtUtc = spec.EffectiveFromUtc
                });
            }
            await db.SaveChangesAsync(cancellationToken);
        }
        if (transaction is not null) await transaction.CommitAsync(cancellationToken);
    }
}
