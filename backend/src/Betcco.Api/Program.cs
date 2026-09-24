using System.Net;
using System.Threading.RateLimiting;
using System.Security.Claims;
using System.Security.Cryptography.X509Certificates;
using Amazon;
using Amazon.Runtime;
using Amazon.S3;
using Betcco.Api;
using Betcco.Api.Authorization;
using Betcco.Api.Configuration;
using Betcco.Application.Assignments;
using Betcco.Application.Catalog;
using Betcco.Application.Common;
using Betcco.Application.Commerce;
using Betcco.Application.Courses;
using Betcco.Application.Evaluations;
using Betcco.Application.Learning;
using Betcco.Application.Privacy;
using Betcco.Infrastructure.Identity;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Privacy;
using Betcco.Infrastructure.Services;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

var migrationOnly = args.Any(argument => string.Equals(argument, "--migrate", StringComparison.OrdinalIgnoreCase));
var applicationArguments = args.Where(argument => !string.Equals(argument, "--migrate", StringComparison.OrdinalIgnoreCase)).ToArray();
var builder = WebApplication.CreateBuilder(applicationArguments);
StartupConfigurationValidator.ThrowIfInvalid(builder.Configuration, builder.Environment);
var deploymentEnvironment = builder.Environment.IsProduction() || builder.Environment.IsStaging();
var connectionString = builder.Configuration.GetConnectionString("Postgres")
    ?? builder.Configuration["ConnectionStrings__Postgres"];

builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<BetccoExceptionHandler>();
builder.Services.AddMemoryCache();
builder.Services.AddDbContext<BetccoDbContext>(options => options.UseNpgsql(connectionString));
builder.Services.AddHttpContextAccessor();
var dataProtection = builder.Services.AddDataProtection().SetApplicationName("BETCCO");
var dataProtectionProvider = builder.Configuration["DataProtection:Provider"]
    ?? (builder.Environment.IsProduction() ? null : "FileSystem");
if (string.Equals(dataProtectionProvider, "Postgres", StringComparison.OrdinalIgnoreCase))
{
    dataProtection.PersistKeysToDbContext<BetccoDbContext>();
}
else
{
    var dataProtectionPath = builder.Configuration["DataProtection:KeysPath"] ?? "../keys";
    dataProtection.PersistKeysToFileSystem(new DirectoryInfo(dataProtectionPath));
}

var dataProtectionCertificatePath = builder.Configuration["DataProtection:CertificatePath"];
if (!string.IsNullOrWhiteSpace(dataProtectionCertificatePath))
{
    var certificate = X509CertificateLoader.LoadPkcs12FromFile(
        dataProtectionCertificatePath,
        builder.Configuration["DataProtection:CertificatePassword"]);
    dataProtection.ProtectKeysWithCertificate(certificate);
}
builder.Services.AddIdentity<ApplicationUser, IdentityRole<Guid>>(options =>
{
    options.User.RequireUniqueEmail = true;
    options.SignIn.RequireConfirmedEmail = true;
    options.Lockout.AllowedForNewUsers = true;
    options.Lockout.MaxFailedAccessAttempts = 5;
    options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
    options.Password.RequiredLength = 12;
    options.Password.RequireNonAlphanumeric = true;
    options.Password.RequireUppercase = true;
})
    .AddEntityFrameworkStores<BetccoDbContext>()
    .AddDefaultTokenProviders();
builder.Services.ConfigureApplicationCookie(options =>
{
    options.Cookie.Name = "betcco.auth";
    options.Cookie.HttpOnly = true;
    options.Cookie.SameSite = SameSiteMode.Lax;
    options.Cookie.SecurePolicy = deploymentEnvironment ? CookieSecurePolicy.Always : CookieSecurePolicy.SameAsRequest;
    options.SlidingExpiration = true;
    options.Events.OnValidatePrincipal = async context =>
    {
        // Preserve Identity's built-in security-stamp validation (password reset,
        // account freeze, and logout-all) before enforcing the per-browser session.
        await SecurityStampValidator.ValidatePrincipalAsync(context);

        var principal = context.Principal;
        var userId = principal?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var sessionValue = principal?.FindFirst(BetccoAuthClaims.SessionId)?.Value;
        if (string.IsNullOrWhiteSpace(userId) || !Guid.TryParse(sessionValue, out var sessionId))
        {
            context.RejectPrincipal();
            await context.HttpContext.SignOutAsync(IdentityConstants.ApplicationScheme);
            return;
        }

        var db = context.HttpContext.RequestServices.GetRequiredService<BetccoDbContext>();
        var session = await db.UserSessions.SingleOrDefaultAsync(item =>
            item.Id == sessionId && item.UserId == userId && item.RevokedAtUtc == null && !item.IsDeleted);
        if (session is null)
        {
            context.RejectPrincipal();
            await context.HttpContext.SignOutAsync(IdentityConstants.ApplicationScheme);
            return;
        }

        // Avoid a write on every API request while still giving the account owner a
        // useful recent activity timestamp in the active-sessions screen.
        if (session.LastActiveAtUtc <= DateTimeOffset.UtcNow.AddMinutes(-5))
        {
            session.LastActiveAtUtc = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync();
        }
    };
});
// A frozen or deleted account must lose access on its very next request, rather
// than keeping a previously issued cookie usable until the default validation window.
builder.Services.Configure<SecurityStampValidatorOptions>(options =>
{
    options.ValidationInterval = TimeSpan.Zero;
    options.OnRefreshingPrincipal = context =>
    {
        // Identity recreates the principal after validating its stamp. Keep the
        // signed session claim so the cookie's per-browser revocation check runs.
        var sessionClaim = context.CurrentPrincipal?.FindFirst(BetccoAuthClaims.SessionId);
        if (sessionClaim is not null && context.NewPrincipal?.Identity is ClaimsIdentity identity
            && !identity.HasClaim(claim => claim.Type == BetccoAuthClaims.SessionId))
            identity.AddClaim(new Claim(sessionClaim.Type, sessionClaim.Value));
        return Task.CompletedTask;
    };
});
builder.Services.Configure<DataProtectionTokenProviderOptions>(options => options.TokenLifespan = TimeSpan.FromDays(7));
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("Admin", policy => policy.RequireRole(PlatformRoles.Admin));
    options.AddPolicy("Teacher", policy => policy.RequireRole(PlatformRoles.Teacher));
    options.AddPolicy("Student", policy => policy.RequireRole(PlatformRoles.Student));
    options.AddPolicy("TeacherOrAdmin", policy => policy.RequireRole(PlatformRoles.Teacher, PlatformRoles.Admin));
    options.AddPolicy("CourseAuthor", policy => policy.AddRequirements(new PlatformPermissionRequirement(PlatformPermissions.CourseAuthor)));
    options.AddPolicy("AssessmentAssessor", policy => policy.AddRequirements(new PlatformPermissionRequirement(PlatformPermissions.Assess)));
    options.AddPolicy("AssessmentVerifier", policy => policy.AddRequirements(new PlatformPermissionRequirement(PlatformPermissions.VerifyAssessments)));
    options.AddPolicy("InternalVerificationPlanner", policy => policy.AddRequirements(new PlatformPermissionRequirement(PlatformPermissions.PlanInternalVerification)));
    options.AddPolicy("AssessmentAppealReviewer", policy => policy.AddRequirements(new PlatformPermissionRequirement(PlatformPermissions.ReviewAssessmentAppeals)));
    options.AddPolicy("CourseReviewer", policy => policy.AddRequirements(new PlatformPermissionRequirement(PlatformPermissions.ReviewCourses)));
    options.AddPolicy("FinanceAdmin", policy => policy.AddRequirements(new PlatformPermissionRequirement(PlatformPermissions.ManageFinance)));
    options.AddPolicy("SupportAdmin", policy => policy.AddRequirements(new PlatformPermissionRequirement(PlatformPermissions.ManageSupport)));
    options.AddPolicy("SystemAdmin", policy => policy.AddRequirements(new PlatformPermissionRequirement(PlatformPermissions.ManageUsers)));
    options.AddPolicy("StudentTeacherFreeze", policy => policy.AddRequirements(new PlatformPermissionRequirement(PlatformPermissions.FreezeStudentTeacher)));
    options.AddPolicy("PrivacyAdmin", policy => policy.AddRequirements(new PlatformPermissionRequirement(PlatformPermissions.ManagePrivacy)));
    options.AddPolicy("SecurityIncidentAdmin", policy => policy.AddRequirements(new PlatformPermissionRequirement(PlatformPermissions.ManageSecurityIncidents)));
});
builder.Services.AddSingleton<IAuthorizationHandler, PlatformPermissionAuthorizationHandler>();
builder.Services.AddAntiforgery(options => { options.HeaderName = "X-CSRF-TOKEN"; options.Cookie.Name = "betcco.csrf"; });
builder.Services.Configure<Microsoft.AspNetCore.Http.Features.FormOptions>(options =>
    options.MultipartBodyLengthLimit = 510L * 1024 * 1024);
builder.Services.AddControllersWithViews(options => options.Filters.Add(new AutoValidateAntiforgeryTokenAttribute()));
builder.Services.AddOpenApi();
builder.Services.AddSwaggerGen();
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("auth", context => RateLimitPartition.GetFixedWindowLimiter(
        $"{context.Connection.RemoteIpAddress?.ToString() ?? "unknown"}:{context.Request.Path.Value}",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 10,
            Window = TimeSpan.FromMinutes(5),
            QueueLimit = 0
        }));
    options.AddPolicy("login", context => RateLimitPartition.GetFixedWindowLimiter(
        $"{context.Connection.RemoteIpAddress?.ToString() ?? "unknown"}:login",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 5,
            Window = TimeSpan.FromMinutes(10),
            QueueLimit = 0
        }));
    options.AddPolicy("password-reset", context => RateLimitPartition.GetFixedWindowLimiter(
        $"{context.Connection.RemoteIpAddress?.ToString() ?? "unknown"}:password-reset",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 5,
            Window = TimeSpan.FromMinutes(15),
            QueueLimit = 0
        }));
    options.AddPolicy("search", context => RateLimitPartition.GetFixedWindowLimiter(
        $"{context.Connection.RemoteIpAddress?.ToString() ?? "unknown"}:search",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 120,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0
        }));
    options.AddPolicy("upload", context => RateLimitPartition.GetFixedWindowLimiter(
        context.User.Identity?.Name ?? context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 12,
            Window = TimeSpan.FromMinutes(5),
            QueueLimit = 0
        }));
    options.AddPolicy("checkout", context => RateLimitPartition.GetFixedWindowLimiter(
        context.User.Identity?.Name ?? context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 10,
            Window = TimeSpan.FromMinutes(5),
            QueueLimit = 0
        }));
    options.AddPolicy("webhook", context => RateLimitPartition.GetFixedWindowLimiter(
        $"{context.Connection.RemoteIpAddress?.ToString() ?? "unknown"}:{context.Request.Path.Value}",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 120,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0
        }));
    options.AddFixedWindowLimiter("write", limiter =>
    {
        limiter.PermitLimit = 60;
        limiter.Window = TimeSpan.FromMinutes(1);
        limiter.QueueLimit = 0;
    });
    options.AddPolicy("ai", context => RateLimitPartition.GetFixedWindowLimiter(
        context.User.Identity?.Name ?? context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 20,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0
        }));
});
builder.Services.AddCors(options => options.AddPolicy("same-origin", policy =>
{
    var origins = builder.Configuration.GetSection("AllowedOrigins").Get<string[]>() ?? ["http://localhost:3000"];
    policy.WithOrigins(origins).AllowAnyHeader().AllowAnyMethod().AllowCredentials();
}));
var reverseProxyEnabled = builder.Configuration.GetValue("ReverseProxy:Enabled", false);
if (reverseProxyEnabled)
{
    var knownProxies = builder.Configuration.GetSection("ReverseProxy:KnownProxies").Get<string[]>() ?? [];
    builder.Services.Configure<ForwardedHeadersOptions>(options =>
    {
        options.ForwardedHeaders = ForwardedHeaders.XForwardedFor
            | ForwardedHeaders.XForwardedProto
            | ForwardedHeaders.XForwardedHost;
        options.ForwardLimit = Math.Clamp(builder.Configuration.GetValue("ReverseProxy:ForwardLimit", 1), 1, 3);
        foreach (var proxy in knownProxies)
        {
            if (!IPAddress.TryParse(proxy, out var address)) continue;
            options.KnownProxies.Add(address);
            if (address.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork)
                options.KnownProxies.Add(address.MapToIPv6());
        }
    });
}
builder.Services.Configure<HostOptions>(options =>
    options.ShutdownTimeout = TimeSpan.FromSeconds(
        Math.Clamp(builder.Configuration.GetValue("Operations:ShutdownTimeoutSeconds", 30), 10, 120)));

builder.Services.AddScoped<ICurrentUserAccessor, CurrentUserAccessor>();
builder.Services.AddScoped<IAssessorEligibilityService, AssessorEligibilityService>();
builder.Services.AddScoped<IGuardianAccessAuthorizer, GuardianAccessAuthorizer>();
builder.Services.AddScoped<IPrivacyExecutionService, PrivacyExecutionService>();
builder.Services.AddScoped<IEraseConcealmentExecutionService, EraseConcealmentExecutionService>();
builder.Services.AddScoped<IPrivacySubjectDataService, PrivacySubjectDataService>();
builder.Services.AddScoped<DataSubjectFulfillmentService>();
builder.Services.AddScoped<IDataSubjectFulfillmentService>(serviceProvider => serviceProvider.GetRequiredService<DataSubjectFulfillmentService>());
builder.Services.AddScoped<IDataProcessingRestrictionChecker>(serviceProvider => serviceProvider.GetRequiredService<DataSubjectFulfillmentService>());
builder.Services.AddScoped<IDataPortabilityExportService, DataPortabilityExportService>();
var storageProvider = builder.Configuration["Storage:Provider"] ?? "Local";
if (string.Equals(storageProvider, "S3Compatible", StringComparison.OrdinalIgnoreCase))
{
    builder.Services.AddSingleton<IAmazonS3>(_ =>
    {
        var region = builder.Configuration["Storage:S3:Region"] ?? "us-east-1";
        var endpoint = builder.Configuration["Storage:S3:Endpoint"];
        var s3Configuration = new AmazonS3Config
        {
            RegionEndpoint = RegionEndpoint.GetBySystemName(region),
            ForcePathStyle = builder.Configuration.GetValue("Storage:S3:ForcePathStyle", false),
            MaxErrorRetry = Math.Clamp(builder.Configuration.GetValue("Storage:S3:MaxRetries", 3), 0, 5),
            Timeout = TimeSpan.FromSeconds(Math.Clamp(builder.Configuration.GetValue("Storage:S3:TimeoutSeconds", 100), 5, 300))
        };
        if (!string.IsNullOrWhiteSpace(endpoint)) s3Configuration.ServiceURL = endpoint.TrimEnd('/');

        var accessKey = builder.Configuration["Storage:S3:AccessKey"];
        var secretKey = builder.Configuration["Storage:S3:SecretKey"];
        return !string.IsNullOrWhiteSpace(accessKey) && !string.IsNullOrWhiteSpace(secretKey)
            ? new AmazonS3Client(new BasicAWSCredentials(accessKey, secretKey), s3Configuration)
            : new AmazonS3Client(s3Configuration);
    });
    builder.Services.AddScoped<IFileStorage, S3CompatiblePrivateFileStorage>();
}
else if (string.Equals(storageProvider, "Local", StringComparison.OrdinalIgnoreCase)
         || string.Equals(storageProvider, "LocalPrivate", StringComparison.OrdinalIgnoreCase))
{
    builder.Services.AddScoped<IFileStorage, LocalPrivateFileStorage>();
}
else
{
    throw new InvalidOperationException("Storage:Provider must be Local or S3Compatible.");
}
builder.Services.AddScoped<IStorageLifecycleCoordinator, StorageLifecycleCoordinator>();
if (!builder.Environment.IsEnvironment("Testing"))
{
    builder.Services.AddHostedService<StorageProviderStartupService>();
    builder.Services.AddHostedService<StorageLifecycleWorker>();
}
builder.Services.AddSingleton<IFileSecurityScanner>(serviceProvider =>
{
    var environment = serviceProvider.GetRequiredService<IHostEnvironment>();
    if (environment.IsDevelopment() || environment.IsEnvironment("Testing")) return new DevelopmentFileSecurityScanner();
    var configuration = serviceProvider.GetRequiredService<IConfiguration>();
    return string.Equals(configuration["Storage:ScannerProvider"], "ClamAv", StringComparison.OrdinalIgnoreCase)
        ? new ClamAvFileSecurityScanner(configuration)
        : new UnconfiguredFileSecurityScanner();
});
builder.Services.AddScoped<IEmailSender, SmtpEmailSender>();
builder.Services.AddScoped<RegistrationEmailOutboxDispatcher>();
builder.Services.AddScoped<IEmailNotificationService, PlatformEmailNotificationService>();
builder.Services.AddScoped<IUpcomingDeadlineNotificationService, UpcomingDeadlineNotificationService>();
builder.Services.AddHttpClient<OpenAiResponsesAiProvider>(client =>
{
    var baseUrl = builder.Configuration["Ai:BaseUrl"] ?? "https://api.openai.com/v1/";
    client.BaseAddress = new Uri(baseUrl, UriKind.Absolute);
    client.Timeout = TimeSpan.FromSeconds(30);
});
builder.Services.AddScoped<IAiProvider>(serviceProvider =>
{
    var configuration = serviceProvider.GetRequiredService<IConfiguration>();
    return bool.TryParse(configuration["Ai:Enabled"], out var enabled)
        && enabled
        && string.Equals(configuration["Ai:Provider"], "OpenAI", StringComparison.OrdinalIgnoreCase)
        ? serviceProvider.GetRequiredService<OpenAiResponsesAiProvider>()
        : new DisabledAiProvider();
});
builder.Services.AddHttpClient<OneRosterSchoolIntegrationProvider>(client =>
{
    var baseUrl = builder.Configuration["SchoolIntegration:OneRoster:BaseUrl"];
    if (!string.IsNullOrWhiteSpace(baseUrl)) client.BaseAddress = new Uri(baseUrl.TrimEnd('/') + "/", UriKind.Absolute);
    client.Timeout = TimeSpan.FromSeconds(15);
});
builder.Services.AddScoped<ISchoolIntegrationProvider>(serviceProvider =>
{
    var configuration = serviceProvider.GetRequiredService<IConfiguration>();
    return string.Equals(configuration["SchoolIntegration:Provider"], "OneRoster", StringComparison.OrdinalIgnoreCase)
        && Uri.TryCreate(configuration["SchoolIntegration:OneRoster:BaseUrl"], UriKind.Absolute, out _)
        ? serviceProvider.GetRequiredService<OneRosterSchoolIntegrationProvider>()
        : new DisabledSchoolIntegrationProvider();
});
builder.Services.AddSingleton<ILiveSessionProvider>(new UrlLiveSessionProvider(
    new LiveSessionProviderInfo("Manual", "رابط HTTPS يدوي", "Manual HTTPS link", false, "رابط مباشر يضيفه مسؤول المنصة دون استدعاء خدمة خارجية.", "An administrator-supplied link with no external provider call."),
    ["custom", "other", "external"]));
builder.Services.AddSingleton<ILiveSessionProvider>(new UrlLiveSessionProvider(
    new LiveSessionProviderInfo("GoogleMeet", "Google Meet", "Google Meet", false, "رابط Meet مُنشأ مسبقًا. لا تنشئ BETCCO اجتماعًا عبر Google دون إعداد تكامل منفصل.", "A pre-created Meet link. BETCCO does not create Google meetings without a separate configured adapter."),
    ["google", "google meet", "meet"], ["meet.google.com"]));
builder.Services.AddSingleton<ILiveSessionProvider>(new UrlLiveSessionProvider(
    new LiveSessionProviderInfo("Zoom", "Zoom", "Zoom", false, "رابط Zoom مُنشأ مسبقًا. لا يتم استدعاء API أو الاحتفاظ بمفاتيح Zoom هنا.", "A pre-created Zoom link. No Zoom API is called and no Zoom key is stored here."),
    ["zoom"], ["zoom.us"]));
builder.Services.AddSingleton<ILiveSessionProvider>(new UrlLiveSessionProvider(
    new LiveSessionProviderInfo("MicrosoftTeams", "Microsoft Teams", "Microsoft Teams", false, "رابط Teams مُنشأ مسبقًا. يلزم Adapter منفصل قبل إنشاء الاجتماعات آليًا.", "A pre-created Teams link. A separate adapter is required before managed meeting creation."),
    ["teams", "microsoft teams", "msteams"], ["teams.microsoft.com"]));
builder.Services.AddSingleton<ILiveSessionProvider>(new UrlLiveSessionProvider(
    new LiveSessionProviderInfo("Jitsi", "Jitsi", "Jitsi", false, "رابط Jitsi المُنشأ مسبقًا من meet.jit.si.", "A pre-created Jitsi link from meet.jit.si."),
    ["jitsi"], ["meet.jit.si"]));
builder.Services.AddSingleton<ILiveSessionProviderCatalog, LiveSessionProviderCatalog>();
builder.Services.Configure<PayTabsOptions>(builder.Configuration.GetSection("PayTabs"));
builder.Services.Configure<JoFotaraOptions>(builder.Configuration.GetSection("JoFotara"));
builder.Services.AddHttpClient<PayTabsPaymentProvider>(client =>
{
    var baseUrl = builder.Configuration["PayTabs:BaseUrl"];
    if (Uri.TryCreate(baseUrl, UriKind.Absolute, out var uri)) client.BaseAddress = new Uri(uri.AbsoluteUri.TrimEnd('/') + "/", UriKind.Absolute);
    client.Timeout = TimeSpan.FromSeconds(20);
});
builder.Services.AddHttpClient<JoFotaraFiscalInvoiceProvider>(client =>
{
    var baseUrl = builder.Configuration["JoFotara:BaseUrl"];
    if (Uri.TryCreate(baseUrl, UriKind.Absolute, out var uri)) client.BaseAddress = new Uri(uri.AbsoluteUri.TrimEnd('/') + "/", UriKind.Absolute);
    client.Timeout = TimeSpan.FromSeconds(20);
});
builder.Services.AddScoped<IPaymentProvider>(serviceProvider =>
{
    var environment = serviceProvider.GetRequiredService<IHostEnvironment>();
    var configuration = serviceProvider.GetRequiredService<IConfiguration>();
    if (string.Equals(configuration["Payments:Provider"], "PayTabs", StringComparison.OrdinalIgnoreCase))
        return serviceProvider.GetRequiredService<PayTabsPaymentProvider>();
    return environment.IsDevelopment() || environment.IsEnvironment("Testing")
        ? new FakePaymentProvider()
        : new UnconfiguredPaymentProvider();
});
builder.Services.AddSingleton<IPayoutProvider>(serviceProvider =>
{
    var environment = serviceProvider.GetRequiredService<IHostEnvironment>();
    return environment.IsDevelopment() || environment.IsEnvironment("Testing")
        ? new FakePayoutProvider()
        : new UnconfiguredPayoutProvider();
});
builder.Services.AddScoped<ICatalogService, CatalogService>();
builder.Services.AddScoped<ICourseAuthoringService, CourseAuthoringService>();
builder.Services.AddScoped<IContentAccessService, ContentAccessService>();
builder.Services.AddScoped<IStudentCoursesLearningHubService, StudentCoursesLearningHubService>();
builder.Services.AddScoped<IStudentCoursePlayerService, StudentCoursePlayerService>();
builder.Services.AddScoped<ICourseAssignmentService, CourseAssignmentService>();
builder.Services.AddScoped<ICourseAssignmentDeadlineResolver, CourseAssignmentDeadlineResolver>();
builder.Services.AddScoped<ICourseAssignmentDeadlineExtensionService, CourseAssignmentDeadlineExtensionService>();
builder.Services.AddScoped<ICourseGradebookService, CourseGradebookService>();
builder.Services.AddHostedService<ScheduledCoursePublisher>();
builder.Services.AddHostedService<UpcomingDeadlineNotificationPublisher>();
builder.Services.AddHostedService<RegistrationEmailOutboxPublisher>();
builder.Services.AddScoped<ICommerceService, CommerceService>();
builder.Services.AddScoped<IRefundService, RefundService>();
builder.Services.AddScoped<ICommercialDocumentService, CommercialDocumentService>();
builder.Services.AddScoped<IFiscalInvoiceProvider, JoFotaraFiscalInvoiceProvider>();
builder.Services.AddScoped<IFiscalSubmissionService, FiscalSubmissionService>();
builder.Services.AddScoped<IWalletService, WalletService>();
builder.Services.AddScoped<IEvaluationService, EvaluationService>();
builder.Services.AddScoped<IAssessmentCoordinationService, AssessmentCoordinationService>();
builder.Services.AddScoped<IEvaluatorSpecialismService, EvaluatorSpecialismService>();
builder.Services.AddScoped<IScopedAssessmentService, ScopedAssessmentService>();
builder.Services.AddScoped<IRetakeService, RetakeService>();
builder.Services.AddScoped<IInternalVerificationSamplingService, InternalVerificationSamplingService>();
builder.Services.AddScoped<IEvaluationAppealService, EvaluationAppealService>();
builder.Services.AddScoped<IAssessmentAuditExportService, AssessmentAuditExportService>();
builder.Services.AddSingleton<IAssessmentPdfRenderer>(serviceProvider =>
    AssessmentPdfRendererFactory.Create(serviceProvider.GetRequiredService<IConfiguration>()));
builder.Services.AddScoped<IAssessmentPdfReportService, AssessmentPdfReportService>();
builder.Services.AddScoped<IQualificationRegistryService, QualificationRegistryService>();
builder.Services.AddScoped<IAcademicCatalogueService, AcademicCatalogueService>();
builder.Services.AddScoped<IDeliveryPlanningService, DeliveryPlanningService>();
builder.Services.AddScoped<DatabaseInitializer>();

var app = builder.Build();
if (migrationOnly)
{
    await using var scope = app.Services.CreateAsyncScope();
    var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("Betcco.Migrations");
    logger.LogInformation("Applying BETCCO database migrations.");
    await scope.ServiceProvider.GetRequiredService<BetccoDbContext>().Database.MigrateAsync();
    logger.LogInformation("BETCCO database migrations completed.");
    return;
}
app.UseExceptionHandler();
if (reverseProxyEnabled) app.UseForwardedHeaders();
app.UseHttpsRedirection();
app.UseRouting();
app.UseRateLimiter();
app.UseCors("same-origin");
app.UseAuthentication();
app.UseMiddleware<StaffMfaEnrollmentMiddleware>();
app.UseAuthorization();
app.Use(async (context, next) =>
{
    context.Response.OnStarting(() =>
    {
        context.Response.Headers["X-Content-Type-Options"] = "nosniff";
        context.Response.Headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
        context.Response.Headers["X-Frame-Options"] = "DENY";
        context.Response.Headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()";
        context.Response.Headers["Content-Security-Policy"] = "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'";
        return Task.CompletedTask;
    });
    await next();
});
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.UseSwagger();
    app.UseSwaggerUI();
}
app.MapControllers();
app.MapGet("/health/live", () => Results.Ok(new { status = "live" })).AllowAnonymous();
app.MapGet("/health/ready", async (BetccoDbContext db, IFileStorage storage, CancellationToken cancellationToken) =>
{
    try
    {
        if (!await db.Database.CanConnectAsync(cancellationToken))
            return Results.StatusCode(StatusCodes.Status503ServiceUnavailable);
        if (storage is S3CompatiblePrivateFileStorage s3Storage)
            await s3Storage.CheckAvailabilityAsync(cancellationToken);
        return Results.Ok(new { status = "ready" });
    }
    catch when (!cancellationToken.IsCancellationRequested)
    {
        return Results.StatusCode(StatusCodes.Status503ServiceUnavailable);
    }
}).AllowAnonymous();
if (app.Environment.IsDevelopment())
{
    using var scope = app.Services.CreateScope();
    await scope.ServiceProvider.GetRequiredService<DatabaseInitializer>().InitializeAsync();
}
app.Run();

public partial class Program;
