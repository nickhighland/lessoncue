using System.Buffers.Binary;
using System.Security.Cryptography;
using System.Text;

namespace LessonCue.Server;

/// <summary>
/// Password-encrypted, chunked backup envelope. Every chunk is authenticated
/// with AES-256-GCM and the authenticated header contains the expected length
/// and SHA-256 digest of the complete ZIP archive.
/// </summary>
public static class BackupArchiveEncryption
{
    private static readonly byte[] Magic = "LCBACKUP"u8.ToArray();
    private const byte FormatVersion = 1;
    private const int SaltLength = 16;
    private const int NoncePrefixLength = 8;
    private const int HashLength = 32;
    private const int TagLength = 16;
    private const int KeyLength = 32;
    private const int HeaderLength = 8 + 1 + SaltLength + NoncePrefixLength + 4 + 4 + 8 + HashLength;
    private const int DefaultIterations = 600_000;
    private const int DefaultChunkSize = 1024 * 1024;

    public static bool IsEncrypted(Stream stream)
    {
        if (!stream.CanSeek) throw new ArgumentException("The backup stream must be seekable.", nameof(stream));
        var original = stream.Position;
        Span<byte> candidate = stackalloc byte[Magic.Length];
        var read = stream.Read(candidate);
        stream.Position = original;
        return read == Magic.Length && CryptographicOperations.FixedTimeEquals(candidate, Magic);
    }

    public static long ReadPlaintextLength(Stream stream)
    {
        var header = ReadHeader(stream);
        return header.PlaintextLength;
    }

    public static async Task EncryptAsync(
        string plaintextPath,
        string destinationPath,
        string password,
        CancellationToken ct)
    {
        ValidatePassword(password);
        var file = new FileInfo(plaintextPath);
        if (!file.Exists || file.Length <= 0)
            throw new InvalidDataException("The LessonCue backup archive is empty.");

        byte[] digest;
        await using (var source = File.OpenRead(plaintextPath))
            digest = await SHA256.HashDataAsync(source, ct);

        var salt = RandomNumberGenerator.GetBytes(SaltLength);
        var noncePrefix = RandomNumberGenerator.GetBytes(NoncePrefixLength);
        var header = CreateHeader(salt, noncePrefix, DefaultIterations, DefaultChunkSize, file.Length, digest);
        var key = Rfc2898DeriveBytes.Pbkdf2(
            password, salt, DefaultIterations, HashAlgorithmName.SHA256, KeyLength);

        try
        {
            await using var input = new FileStream(
                plaintextPath, FileMode.Open, FileAccess.Read, FileShare.Read,
                DefaultChunkSize, FileOptions.Asynchronous | FileOptions.SequentialScan);
            await using var output = new FileStream(
                destinationPath, FileMode.CreateNew, FileAccess.Write, FileShare.None,
                DefaultChunkSize, FileOptions.Asynchronous | FileOptions.SequentialScan);
            await output.WriteAsync(header, ct);

            using var aes = new AesGcm(key, TagLength);
            var plaintext = new byte[DefaultChunkSize];
            var ciphertext = new byte[DefaultChunkSize];
            var tag = new byte[TagLength];
            uint chunkIndex = 0;
            while (true)
            {
                var read = await ReadChunkAsync(input, plaintext, ct);
                if (read == 0) break;
                var nonce = CreateNonce(noncePrefix, chunkIndex);
                var associatedData = CreateAssociatedData(header, chunkIndex, read);
                aes.Encrypt(
                    nonce,
                    plaintext.AsSpan(0, read),
                    ciphertext.AsSpan(0, read),
                    tag,
                    associatedData);
                var length = new byte[4];
                BinaryPrimitives.WriteInt32BigEndian(length, read);
                await output.WriteAsync(length, ct);
                await output.WriteAsync(ciphertext.AsMemory(0, read), ct);
                await output.WriteAsync(tag, ct);
                checked { chunkIndex++; }
            }

            await output.FlushAsync(ct);
        }
        catch
        {
            TryDelete(destinationPath);
            throw;
        }
        finally
        {
            CryptographicOperations.ZeroMemory(key);
        }
    }

    public static async Task DecryptAsync(
        string encryptedPath,
        string destinationPath,
        string password,
        CancellationToken ct)
    {
        if (string.IsNullOrEmpty(password))
            throw new InvalidDataException("Enter the password used to encrypt this LessonCue backup.");

        await using var input = new FileStream(
            encryptedPath, FileMode.Open, FileAccess.Read, FileShare.Read,
            DefaultChunkSize, FileOptions.Asynchronous | FileOptions.SequentialScan);
        var header = ReadHeader(input);
        var key = Rfc2898DeriveBytes.Pbkdf2(
            password, header.Salt, header.Iterations, HashAlgorithmName.SHA256, KeyLength);

        try
        {
            await using var output = new FileStream(
                destinationPath, FileMode.CreateNew, FileAccess.Write, FileShare.None,
                header.ChunkSize, FileOptions.Asynchronous | FileOptions.SequentialScan);
            using var aes = new AesGcm(key, TagLength);
            using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
            var ciphertext = new byte[header.ChunkSize];
            var plaintext = new byte[header.ChunkSize];
            var tag = new byte[TagLength];
            var lengthBuffer = new byte[4];
            long remaining = header.PlaintextLength;
            uint chunkIndex = 0;

            while (remaining > 0)
            {
                await ReadExactlyAsync(input, lengthBuffer, ct);
                var length = BinaryPrimitives.ReadInt32BigEndian(lengthBuffer);
                var expected = (int)Math.Min(header.ChunkSize, remaining);
                if (length != expected)
                    throw new InvalidDataException("The encrypted LessonCue backup has an invalid chunk length.");
                await ReadExactlyAsync(input, ciphertext.AsMemory(0, length), ct);
                await ReadExactlyAsync(input, tag, ct);
                var nonce = CreateNonce(header.NoncePrefix, chunkIndex);
                var associatedData = CreateAssociatedData(header.Raw, chunkIndex, length);
                try
                {
                    aes.Decrypt(
                        nonce,
                        ciphertext.AsSpan(0, length),
                        tag,
                        plaintext.AsSpan(0, length),
                        associatedData);
                }
                catch (CryptographicException ex)
                {
                    throw new InvalidDataException(
                        "The backup password is incorrect or the encrypted backup was changed.", ex);
                }

                await output.WriteAsync(plaintext.AsMemory(0, length), ct);
                hash.AppendData(plaintext, 0, length);
                remaining -= length;
                checked { chunkIndex++; }
            }

            if (input.ReadByte() != -1)
                throw new InvalidDataException("The encrypted LessonCue backup contains unexpected trailing data.");
            var actualHash = hash.GetHashAndReset();
            if (!CryptographicOperations.FixedTimeEquals(actualHash, header.PlaintextHash))
                throw new InvalidDataException("The decrypted LessonCue archive did not match its authenticated digest.");
            await output.FlushAsync(ct);
        }
        catch
        {
            TryDelete(destinationPath);
            throw;
        }
        finally
        {
            CryptographicOperations.ZeroMemory(key);
        }
    }

    private static EnvelopeHeader ReadHeader(Stream stream)
    {
        if (!stream.CanSeek) throw new InvalidDataException("The encrypted backup stream is not seekable.");
        var original = stream.Position;
        var raw = new byte[HeaderLength];
        try
        {
            stream.ReadExactly(raw);
        }
        catch (EndOfStreamException ex)
        {
            stream.Position = original;
            throw new InvalidDataException("The encrypted LessonCue backup header is incomplete.", ex);
        }

        if (!CryptographicOperations.FixedTimeEquals(raw.AsSpan(0, Magic.Length), Magic) ||
            raw[Magic.Length] != FormatVersion)
        {
            stream.Position = original;
            throw new InvalidDataException("This is not a supported encrypted LessonCue backup.");
        }

        var offset = Magic.Length + 1;
        var salt = raw.AsSpan(offset, SaltLength).ToArray();
        offset += SaltLength;
        var noncePrefix = raw.AsSpan(offset, NoncePrefixLength).ToArray();
        offset += NoncePrefixLength;
        var iterations = BinaryPrimitives.ReadInt32BigEndian(raw.AsSpan(offset, 4));
        offset += 4;
        var chunkSize = BinaryPrimitives.ReadInt32BigEndian(raw.AsSpan(offset, 4));
        offset += 4;
        var plaintextLength = BinaryPrimitives.ReadInt64BigEndian(raw.AsSpan(offset, 8));
        offset += 8;
        var plaintextHash = raw.AsSpan(offset, HashLength).ToArray();

        if (iterations is < 100_000 or > 10_000_000 ||
            chunkSize is < 64 * 1024 or > 8 * 1024 * 1024 ||
            plaintextLength <= 0)
        {
            stream.Position = original;
            throw new InvalidDataException("The encrypted LessonCue backup header contains unsafe parameters.");
        }

        return new EnvelopeHeader(raw, salt, noncePrefix, iterations, chunkSize, plaintextLength, plaintextHash);
    }

    private static byte[] CreateHeader(
        byte[] salt,
        byte[] noncePrefix,
        int iterations,
        int chunkSize,
        long plaintextLength,
        byte[] plaintextHash)
    {
        var header = new byte[HeaderLength];
        var offset = 0;
        Magic.CopyTo(header, offset);
        offset += Magic.Length;
        header[offset++] = FormatVersion;
        salt.CopyTo(header, offset);
        offset += salt.Length;
        noncePrefix.CopyTo(header, offset);
        offset += noncePrefix.Length;
        BinaryPrimitives.WriteInt32BigEndian(header.AsSpan(offset, 4), iterations);
        offset += 4;
        BinaryPrimitives.WriteInt32BigEndian(header.AsSpan(offset, 4), chunkSize);
        offset += 4;
        BinaryPrimitives.WriteInt64BigEndian(header.AsSpan(offset, 8), plaintextLength);
        offset += 8;
        plaintextHash.CopyTo(header, offset);
        return header;
    }

    private static byte[] CreateNonce(byte[] prefix, uint chunkIndex)
    {
        var nonce = new byte[12];
        prefix.CopyTo(nonce, 0);
        BinaryPrimitives.WriteUInt32BigEndian(nonce.AsSpan(8, 4), chunkIndex);
        return nonce;
    }

    private static byte[] CreateAssociatedData(byte[] header, uint chunkIndex, int length)
    {
        var associatedData = new byte[header.Length + 8];
        header.CopyTo(associatedData, 0);
        BinaryPrimitives.WriteUInt32BigEndian(associatedData.AsSpan(header.Length, 4), chunkIndex);
        BinaryPrimitives.WriteInt32BigEndian(associatedData.AsSpan(header.Length + 4, 4), length);
        return associatedData;
    }

    private static async Task<int> ReadChunkAsync(Stream stream, byte[] buffer, CancellationToken ct)
    {
        var total = 0;
        while (total < buffer.Length)
        {
            var read = await stream.ReadAsync(buffer.AsMemory(total, buffer.Length - total), ct);
            if (read == 0) break;
            total += read;
        }
        return total;
    }

    private static async Task ReadExactlyAsync(Stream stream, Memory<byte> buffer, CancellationToken ct)
    {
        try
        {
            await stream.ReadExactlyAsync(buffer, ct);
        }
        catch (EndOfStreamException ex)
        {
            throw new InvalidDataException("The encrypted LessonCue backup ended unexpectedly.", ex);
        }
    }

    private static void ValidatePassword(string password)
    {
        if (password.Length < 12)
            throw new ArgumentException("Backup passwords must contain at least 12 characters.", nameof(password));
        if (password.Length > 1024)
            throw new ArgumentException("Backup passwords cannot exceed 1,024 characters.", nameof(password));
    }

    private static void TryDelete(string path)
    {
        try { if (File.Exists(path)) File.Delete(path); }
        catch { }
    }

    private sealed record EnvelopeHeader(
        byte[] Raw,
        byte[] Salt,
        byte[] NoncePrefix,
        int Iterations,
        int ChunkSize,
        long PlaintextLength,
        byte[] PlaintextHash);
}
