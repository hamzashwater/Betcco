using Amazon.S3;
using Amazon.S3.Model;

namespace Betcco.Infrastructure.Services;

/// <summary>
/// A bounded, seekable view of one private object. ASP.NET Core can translate
/// browser Range requests into Seek calls without buffering the full video.
/// </summary>
internal sealed class S3RangeReadStream(IAmazonS3 client, string bucket, string key, long length) : Stream
{
    private const long ChunkLength = 8L * 1024 * 1024;
    private GetObjectResponse? _response;
    private long _position;
    private long _rangeEnd = -1;
    private bool _disposed;

    public override bool CanRead => !_disposed;
    public override bool CanSeek => !_disposed;
    public override bool CanWrite => false;
    public override long Length => length;
    public override long Position
    {
        get => _position;
        set => Seek(value, SeekOrigin.Begin);
    }

    public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        if (buffer.Length == 0 || _position >= length) return 0;
        if (_response is null)
        {
            _rangeEnd = Math.Min(length - 1, _position + ChunkLength - 1);
            _response = await client.GetObjectAsync(new GetObjectRequest
            {
                BucketName = bucket,
                Key = key,
                ByteRange = new ByteRange(_position, _rangeEnd)
            }, cancellationToken);
        }

        var remaining = (int)Math.Min(buffer.Length, _rangeEnd - _position + 1);
        var read = await _response.ResponseStream.ReadAsync(buffer[..remaining], cancellationToken);
        if (read == 0) throw new IOException("The private media object ended before its declared content length.");
        _position += read;
        if (_position > _rangeEnd) CloseResponse();
        return read;
    }

    public override Task<int> ReadAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken) =>
        ReadAsync(buffer.AsMemory(offset, count), cancellationToken).AsTask();

    public override int Read(byte[] buffer, int offset, int count) =>
        ReadAsync(buffer.AsMemory(offset, count)).AsTask().GetAwaiter().GetResult();

    public override long Seek(long offset, SeekOrigin origin)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        var next = origin switch
        {
            SeekOrigin.Begin => offset,
            SeekOrigin.Current => checked(_position + offset),
            SeekOrigin.End => checked(length + offset),
            _ => throw new ArgumentOutOfRangeException(nameof(origin))
        };
        if (next < 0 || next > length) throw new IOException("The requested private media position is outside the object.");
        if (next != _position) CloseResponse();
        _position = next;
        return _position;
    }

    public override void Flush() { }
    public override void SetLength(long value) => throw new NotSupportedException();
    public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();

    protected override void Dispose(bool disposing)
    {
        if (disposing) CloseResponse();
        _disposed = true;
        base.Dispose(disposing);
    }

    public override ValueTask DisposeAsync()
    {
        CloseResponse();
        _disposed = true;
        return base.DisposeAsync();
    }

    private void CloseResponse()
    {
        _response?.Dispose();
        _response = null;
    }
}
