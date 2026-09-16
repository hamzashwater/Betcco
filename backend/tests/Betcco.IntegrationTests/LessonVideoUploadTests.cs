using System.Security.Claims;
using System.Text.Json;
using Betcco.Api.Controllers;
using Betcco.Application.Common;
using Betcco.Domain.Common;
using Betcco.Domain.Learning;
using Betcco.Domain.Platform;
using Betcco.Infrastructure.Persistence;
using Betcco.Infrastructure.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;

namespace Betcco.IntegrationTests;

public sealed class LessonVideoUploadTests
{
    private static readonly byte[] Mp4 =
    [
        0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6F, 0x6D, 0, 0, 0, 0,
        0, 0, 0, 8, 0x6D, 0x64, 0x61, 0x74
    ];
    private static readonly byte[] Webm =
    [
        0x1A, 0x45, 0xDF, 0xA3, 0x8B, 0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6D,
        0x18, 0x53, 0x80, 0x67, 0x80
    ];

    [Fact]
    public async Task Approved_video_upload_replace_and_delete_use_private_lifecycle_without_exposing_keys()
    {
        await using var fixture = await VideoFixture.CreateAsync();
        var first = Assert.IsType<OkObjectResult>(await fixture.Owner.UploadLessonVideo(fixture.Lesson.Id, File("first.mp4", Mp4)));
        Assert.DoesNotContain("storageKey", JsonSerializer.Serialize(first.Value), StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("objects/", JsonSerializer.Serialize(first.Value), StringComparison.OrdinalIgnoreCase);
        var firstKey = fixture.Storage.Finalized.Single();

        var second = Assert.IsType<OkObjectResult>(await fixture.Owner.UploadLessonVideo(fixture.Lesson.Id, File("second.webm", Webm)));
        Assert.DoesNotContain("storageKey", JsonSerializer.Serialize(second.Value), StringComparison.OrdinalIgnoreCase);
        Assert.Contains(firstKey, fixture.Storage.Deleted);
        Assert.Equal(2, fixture.Storage.Finalized.Count);
        Assert.Single(await fixture.Db.LessonResources.Where(item => item.LessonId == fixture.Lesson.Id).ToListAsync());

        Assert.IsType<NoContentResult>(await fixture.Owner.RemoveLessonVideo(fixture.Lesson.Id, default));
        Assert.Contains(fixture.Storage.Finalized.Last(), fixture.Storage.Deleted);
        Assert.Null(fixture.Lesson.VideoReference);
        Assert.Empty(await fixture.Db.LessonResources.Where(item => item.LessonId == fixture.Lesson.Id).ToListAsync());
    }

    [Fact]
    public async Task Oversized_spoofed_rejected_and_unscanned_uploads_never_reach_storage()
    {
        await using var fixture = await VideoFixture.CreateAsync();
        var oversized = new FormFile(new MemoryStream([1]), 0, 500L * 1024 * 1024 + 1, "file", "large.mp4");
        Assert.IsType<BadRequestObjectResult>(await fixture.Owner.UploadLessonVideo(fixture.Lesson.Id, oversized));
        Assert.IsType<BadRequestObjectResult>(await fixture.Owner.UploadLessonVideo(fixture.Lesson.Id, File("spoof.mp4", "not video"u8.ToArray())));
        fixture.Scanner.Outcome = FileScanOutcome.Rejected;
        Assert.IsType<BadRequestObjectResult>(await fixture.Owner.UploadLessonVideo(fixture.Lesson.Id, File("rejected.mp4", Mp4)));
        fixture.Scanner.Outcome = FileScanOutcome.Unavailable;
        var unavailable = Assert.IsType<ObjectResult>(await fixture.Owner.UploadLessonVideo(fixture.Lesson.Id, File("unscanned.mp4", Mp4)));
        Assert.Equal(StatusCodes.Status503ServiceUnavailable, unavailable.StatusCode);
        Assert.Empty(fixture.Storage.Finalized);
        Assert.Equal(0, fixture.Storage.StagedCount);
    }

    [Fact]
    public async Task Foreign_teacher_is_rejected_before_scanning_or_staging()
    {
        await using var fixture = await VideoFixture.CreateAsync();
        Assert.IsType<NotFoundResult>(await fixture.Foreign.UploadLessonVideo(fixture.Lesson.Id, File("foreign.mp4", Mp4)));
        Assert.IsType<NotFoundResult>(await fixture.Foreign.RemoveLessonVideo(fixture.Lesson.Id, default));
        Assert.Equal(0, fixture.Scanner.Calls);
        Assert.Equal(0, fixture.Storage.StagedCount);
    }

    [Fact]
    public async Task Failed_finalization_keeps_the_previous_video_and_queues_dependent_cleanup()
    {
        await using var fixture = await VideoFixture.CreateAsync();
        Assert.IsType<OkObjectResult>(await fixture.Owner.UploadLessonVideo(fixture.Lesson.Id, File("first.mp4", Mp4)));
        var previousReference = fixture.Lesson.VideoReference;
        var previousKey = fixture.Storage.Finalized.Single();
        fixture.Storage.FailNextFinalize = true;

        var response = Assert.IsType<ObjectResult>(await fixture.Owner.UploadLessonVideo(fixture.Lesson.Id, File("second.mp4", Mp4)));

        Assert.Equal(StatusCodes.Status503ServiceUnavailable, response.StatusCode);
        Assert.Equal(previousReference, fixture.Lesson.VideoReference);
        Assert.DoesNotContain(previousKey, fixture.Storage.Deleted);
        Assert.Contains(fixture.Db.StorageLifecycleOperations, item => item.Action == StorageLifecycleAction.Delete
            && item.StagingKey == item.StorageKey && item.Status == StorageLifecycleStatus.Pending);
    }

    private static FormFile File(string name, byte[] bytes) => new(new MemoryStream(bytes), 0, bytes.Length, "file", name);

    private sealed class VideoFixture : IAsyncDisposable
    {
        private VideoFixture(BetccoDbContext db, Lesson lesson, RecordingStorage storage, ConfigurableScanner scanner)
        {
            Db = db;
            Lesson = lesson;
            Storage = storage;
            Scanner = scanner;
            var service = new CourseAuthoringService(db);
            var lifecycle = new StorageLifecycleCoordinator(db, storage, NullLogger<StorageLifecycleCoordinator>.Instance);
            Owner = Controller("owner", service, storage, lifecycle, scanner, db);
            Foreign = Controller("foreign", service, storage, lifecycle, scanner, db);
        }

        public BetccoDbContext Db { get; }
        public Lesson Lesson { get; }
        public RecordingStorage Storage { get; }
        public ConfigurableScanner Scanner { get; }
        public CourseAuthoringController Owner { get; }
        public CourseAuthoringController Foreign { get; }

        public static async Task<VideoFixture> CreateAsync()
        {
            var db = new BetccoDbContext(new DbContextOptionsBuilder<BetccoDbContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
            var course = new Course
            {
                Slug = "video-upload-test",
                ArabicTitle = "دورة",
                EnglishTitle = "Course",
                ArabicDescription = "وصف",
                EnglishDescription = "Description",
                LearningTrackId = Guid.NewGuid(),
                TeacherUserId = "owner",
                Status = CourseStatus.Draft,
                IsFree = true
            };
            var module = new CourseModule { Course = course, ArabicTitle = "وحدة", EnglishTitle = "Unit" };
            var lesson = new Lesson { CourseModule = module, ArabicTitle = "درس", EnglishTitle = "Lesson", Type = LessonType.Text };
            db.AddRange(course, module, lesson);
            await db.SaveChangesAsync();
            return new VideoFixture(db, lesson, new RecordingStorage(), new ConfigurableScanner());
        }

        public ValueTask DisposeAsync() => Db.DisposeAsync();

        private static CourseAuthoringController Controller(string userId, CourseAuthoringService service,
            IFileStorage storage, IStorageLifecycleCoordinator lifecycle, IFileSecurityScanner scanner, BetccoDbContext db) =>
            new(service, storage, lifecycle, scanner, db)
            {
                ControllerContext = new ControllerContext
                {
                    HttpContext = new DefaultHttpContext
                    {
                        User = new ClaimsPrincipal(new ClaimsIdentity(
                            [new Claim(ClaimTypes.NameIdentifier, userId), new Claim(ClaimTypes.Role, "Teacher")], "Test"))
                    }
                }
            };
    }

    private sealed class ConfigurableScanner : IFileSecurityScanner
    {
        public FileScanOutcome Outcome { get; set; } = FileScanOutcome.Clean;
        public int Calls { get; private set; }
        public Task<FileScanResult> ScanAsync(Stream content, CancellationToken cancellationToken = default)
        {
            Calls++;
            return Task.FromResult(new FileScanResult(Outcome));
        }
    }

    private sealed class RecordingStorage : IFileStorage
    {
        public int StagedCount { get; private set; }
        public bool FailNextFinalize { get; set; }
        public List<string> Finalized { get; } = [];
        public List<string> Deleted { get; } = [];
        public Task<string> SavePrivateAsync(Stream content, string contentType, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<Stream?> OpenPrivateReadAsync(string storageKey, CancellationToken cancellationToken = default) => Task.FromResult<Stream?>(null);
        public Task<StagedPrivateFile> StagePrivateAsync(Stream content, string contentType, CancellationToken cancellationToken = default)
        {
            StagedCount++;
            var id = Guid.NewGuid().ToString("N");
            return Task.FromResult(new StagedPrivateFile($"staging/2026/09/{id}", $"objects/2026/09/{id}", contentType, content.Length, DateTimeOffset.UtcNow));
        }
        public Task FinalizePrivateAsync(StagedPrivateFile file, CancellationToken cancellationToken = default)
        {
            if (FailNextFinalize)
            {
                FailNextFinalize = false;
                throw new IOException("Storage temporarily unavailable");
            }
            Finalized.Add(file.StorageKey);
            return Task.CompletedTask;
        }
        public Task DeletePrivateAsync(string storageKey, CancellationToken cancellationToken = default)
        {
            Deleted.Add(storageKey);
            return Task.CompletedTask;
        }
    }
}
